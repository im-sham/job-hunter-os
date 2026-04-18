import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import {
  DEFAULT_ASSISTANT_ID,
  resolveAssistantOption,
} from './assistant-options.mjs';
import { buildApplicationRunPack } from './application-runs.mjs';
import { buildTaskPack } from './task-packs.mjs';
import { buildSourcingRunPack } from './opportunity-sourcing.mjs';
import { loadWorkspace, resolveWorkspacePath } from './workspace.mjs';

const BRIDGE_ROOT = path.join('data', 'agent-bridge');
const QUEUE_FILE = path.join(BRIDGE_ROOT, 'queue.yml');
const OUTBOX_ROOT = path.join(BRIDGE_ROOT, 'outbox');
const MAX_QUEUE_ITEMS = 25;

const ADAPTERS = {
  folder_access: {
    id: 'folder_access',
    title: 'Folder-Connected Agent',
    summary: 'Best when the assistant can open the local repo or workspace directly.',
    transport: 'Workspace references',
    best_for: ['Codex', 'Claude Code', 'Other local coding agents'],
    output_style: 'Creates a handoff folder with prompt, manifest, and workspace references.',
  },
  chat_upload: {
    id: 'chat_upload',
    title: 'Chat Upload Bundle',
    summary: 'Best when the assistant only sees files you upload into a desktop chat.',
    transport: 'Prepared upload bundle',
    best_for: ['ChatGPT desktop chat', 'Claude desktop chat', 'Other chat-only assistants'],
    output_style: 'Creates a ready-to-upload bundle with copied files plus the prompt.',
  },
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureParentDir(filePath) {
  ensureDir(path.dirname(filePath));
}

function writeTextFile(filePath, value) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, value, 'utf-8');
}

function writeJsonFile(filePath, value) {
  writeTextFile(filePath, JSON.stringify(value, null, 2));
}

function readYamlFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return yaml.load(fs.readFileSync(filePath, 'utf-8')) || null;
}

function writeYamlFile(filePath, value) {
  writeTextFile(filePath, yaml.dump(value, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  }));
}

function readTextFile(filePath) {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

function slugify(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'handoff';
}

function adapterDefinition(adapter) {
  const resolved = ADAPTERS[adapter];
  if (!resolved) {
    throw new Error(`Unsupported agent bridge adapter: ${adapter}`);
  }
  return resolved;
}

function queueFilePath(workspacePath) {
  return path.join(workspacePath, QUEUE_FILE);
}

function outboxRootPath(workspacePath) {
  return path.join(workspacePath, OUTBOX_ROOT);
}

function loadQueueState(workspacePath) {
  return readYamlFile(queueFilePath(workspacePath)) || {
    version: 1,
    updated_at: null,
    tasks: [],
  };
}

function saveQueueState(workspacePath, queue) {
  ensureDir(outboxRootPath(workspacePath));
  writeYamlFile(queueFilePath(workspacePath), queue);
}

function uniq(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function timestampSlug(value) {
  return String(value)
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'z')
    .replace('T', 't');
}

function resolveWorkspaceFile(workspacePath, relativePath) {
  const absolutePath = path.resolve(workspacePath, relativePath);
  const workspaceRoot = `${workspacePath}${path.sep}`;

  if (absolutePath !== workspacePath && !absolutePath.startsWith(workspaceRoot)) {
    throw new Error(`Path is outside the workspace: ${relativePath}`);
  }

  return absolutePath;
}

function copyFileWithMeta(sourcePath, targetPath) {
  ensureParentDir(targetPath);
  fs.copyFileSync(sourcePath, targetPath);
  const stats = fs.statSync(targetPath);
  return {
    byte_size: stats.size,
  };
}

function uploadBundleName(relativePath, index) {
  const extension = path.extname(relativePath) || '.txt';
  const base = slugify(path.basename(relativePath, extension));
  return `${String(index + 1).padStart(2, '0')}-${base}${extension}`;
}

function handoffLaunchNotes({ adapter, assistantTitle, bundleDir, promptFile, uploadDir, taskPackPath }) {
  if (adapter === 'chat_upload') {
    return [
      `Open a new chat in ${assistantTitle || 'your chat assistant'}.`,
      `Open the handoff folder at ${bundleDir}.`,
      `Upload the files inside ${uploadDir} to your chat assistant.`,
      `Paste the prompt from ${promptFile} into the same chat before asking for output.`,
      'Review every draft manually and keep all human-gated answers under explicit human control.',
    ];
  }

  return [
    `Open ${assistantTitle || 'your folder-connected assistant'} in the workspace and point it to ${taskPackPath}.`,
    `Use the handoff notes in ${bundleDir} if you want a clean launch point.`,
    `Have the agent read the referenced workspace files before it drafts or evaluates anything.`,
    'Keep submissions and sensitive field handling human-approved only.',
  ];
}

function handoffNextAction(adapter, uploadCount) {
  if (adapter === 'chat_upload') {
    return `Upload ${uploadCount} prepared file${uploadCount === 1 ? '' : 's'} plus prompt.txt into your chat assistant.`;
  }
  return 'Open the workspace in your folder-connected agent and start from the queued handoff.';
}

function handoffReadme({
  candidateName,
  adapterMeta,
  handoff,
  workspacePath,
  uploadFiles,
  missingFiles,
}) {
  const uploadLines = uploadFiles.length
    ? uploadFiles.map(file => `- ${file.bundle_relative_path} (from ${file.source_relative_path})`).join('\n')
    : '- No copied upload files were needed for this adapter.';
  const missingLines = missingFiles.length
    ? missingFiles.map(file => `- ${file}`).join('\n')
    : '- None';

  return [
    `# ${handoff.task_title}`,
    '',
    `- Candidate: ${candidateName}`,
    `- Opportunity: ${handoff.opportunity_label}`,
    `- Adapter: ${adapterMeta.title}`,
    `- Created: ${handoff.created_at}`,
    '',
    '## What This Handoff Does',
    '',
    adapterMeta.output_style,
    '',
    '## What To Do Next',
    '',
    handoff.launch_notes.map(note => `- ${note}`).join('\n'),
    '',
    '## Files In This Bundle',
    '',
    uploadLines,
    '',
    '## Missing Referenced Files',
    '',
    missingLines,
    '',
    '## Important Rules',
    '',
    '- Keep the workflow local-first and grounded in the workspace files.',
    '- Do not auto-submit anything or fabricate completion.',
    '- Treat legal, EEO, authorization, compensation, and other sensitive fields as human-confirmed only.',
    '',
    `Workspace path: ${workspacePath}`,
    '',
    `Primary task pack: ${handoff.task_pack}`,
    `Prompt file: ${handoff.prompt_file}`,
  ].join('\n');
}

function summarizeTaskEntry(workspacePath, entry) {
  const bundleDir = path.join(workspacePath, entry.bundle_dir);
  const promptFile = path.join(workspacePath, entry.prompt_file);
  const readmeFile = path.join(workspacePath, entry.readme_file);
  const manifestFile = path.join(workspacePath, entry.manifest_file);
  const taskPackCopy = entry.task_pack_copy ? path.join(workspacePath, entry.task_pack_copy) : null;
  const promptText = readTextFile(promptFile);

  return {
    id: entry.id,
    status: entry.status,
    adapter: entry.adapter,
    adapter_title: adapterDefinition(entry.adapter).title,
    task_type: entry.task_type,
    task_title: entry.task_title,
    assistant_id: entry.assistant_id || null,
    assistant_title: entry.assistant_title || null,
    opportunity_id: entry.opportunity_id,
    opportunity_label: entry.opportunity_label,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
    next_user_action: entry.next_user_action,
    launch_notes: entry.launch_notes || [],
    bundle_dir: entry.bundle_dir,
    absolute_bundle_dir: bundleDir,
    prompt_file: entry.prompt_file,
    absolute_prompt_file: promptFile,
    prompt_text: promptText,
    readme_file: entry.readme_file,
    absolute_readme_file: readmeFile,
    manifest_file: entry.manifest_file,
    absolute_manifest_file: manifestFile,
    task_pack: entry.task_pack,
    task_pack_copy: entry.task_pack_copy || null,
    absolute_task_pack_copy: taskPackCopy,
    upload_files: entry.upload_files || [],
    upload_count: (entry.upload_files || []).length,
    recommended_files: entry.recommended_files || [],
    missing_files: entry.missing_files || [],
  };
}

function copyUploadFiles(workspacePath, bundlePath, relativeFiles) {
  const uploadDir = path.join(bundlePath, 'uploads');
  const copied = [];
  const missing = [];

  relativeFiles.forEach((relativePath, index) => {
    const sourcePath = resolveWorkspaceFile(workspacePath, relativePath);
    if (!fs.existsSync(sourcePath)) {
      missing.push(relativePath);
      return;
    }

    const targetRelativePath = path.join('uploads', uploadBundleName(relativePath, index));
    const targetPath = path.join(bundlePath, targetRelativePath);
    const meta = copyFileWithMeta(sourcePath, targetPath);

    copied.push({
      source_relative_path: relativePath,
      bundle_relative_path: targetRelativePath,
      byte_size: meta.byte_size,
    });
  });

  return {
    upload_dir: uploadDir,
    copied,
    missing,
  };
}

export function agentBridgeSnapshot(workspaceArg) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const queue = loadQueueState(workspacePath);
  const tasks = (queue.tasks || [])
    .slice()
    .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')));
  const recent = tasks.slice(0, 8).map(task => summarizeTaskEntry(workspacePath, task));

  return {
    queue_count: tasks.length,
    queued_count: tasks.filter(task => task.status === 'queued').length,
    adapters: Object.values(ADAPTERS).map(adapter => ({
      ...adapter,
      status: 'ready',
    })),
    recent_handoffs: recent,
    latest_handoff: recent[0] || null,
  };
}

export function queueAgentTask({ workspaceArg, opportunityId, taskType, adapter, assistantId = DEFAULT_ASSISTANT_ID }) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const assistant = resolveAssistantOption(assistantId);
  const resolvedAdapter = assistant.supported_modes.includes(adapter)
    ? adapter
    : assistant.recommended_mode;
  const adapterMeta = adapterDefinition(resolvedAdapter);
  const workspace = loadWorkspace(workspacePath);
  const taskPack = buildTaskPack({
    workspaceArg: workspacePath,
    opportunityId,
    taskType,
    mode: resolvedAdapter,
  });

  const createdAt = new Date().toISOString();
  const handoffId = [
    timestampSlug(createdAt),
    slugify(taskPack.opportunity.company),
    slugify(taskPack.opportunity.role),
    slugify(taskPack.task_title),
  ].join('-');

  const bundleRelativeDir = path.join(OUTBOX_ROOT, handoffId);
  const bundlePath = path.join(workspacePath, bundleRelativeDir);
  ensureDir(bundlePath);

  const promptRelativePath = path.join(bundleRelativeDir, 'prompt.txt');
  const readmeRelativePath = path.join(bundleRelativeDir, 'README.md');
  const manifestRelativePath = path.join(bundleRelativeDir, 'manifest.json');
  const taskPackCopyRelativePath = path.join(bundleRelativeDir, 'task-pack.md');

  writeTextFile(path.join(workspacePath, promptRelativePath), taskPack.prompt);
  copyFileWithMeta(
    resolveWorkspaceFile(workspacePath, taskPack.output_task_pack),
    path.join(workspacePath, taskPackCopyRelativePath)
  );

  const uploadSourceFiles = resolvedAdapter === 'chat_upload'
    ? uniq([taskPack.output_task_pack, ...taskPack.recommended_files])
    : [];
  const uploadMeta = copyUploadFiles(workspacePath, bundlePath, uploadSourceFiles);

  const entry = {
    id: handoffId,
    status: 'queued',
    adapter: resolvedAdapter,
    assistant_id: assistant.id,
    assistant_title: assistant.title,
    task_type: taskPack.task_type,
    task_title: taskPack.task_title,
    opportunity_id: taskPack.opportunity.id,
    opportunity_label: `${taskPack.opportunity.company} - ${taskPack.opportunity.role}`,
    created_at: createdAt,
    updated_at: createdAt,
    bundle_dir: bundleRelativeDir,
    task_pack: taskPack.output_task_pack,
    task_pack_copy: taskPackCopyRelativePath,
    prompt_file: promptRelativePath,
    readme_file: readmeRelativePath,
    manifest_file: manifestRelativePath,
    recommended_files: taskPack.recommended_files,
    upload_files: uploadMeta.copied,
    missing_files: uploadMeta.missing,
  };

  entry.launch_notes = handoffLaunchNotes({
    adapter: resolvedAdapter,
    assistantTitle: assistant.title,
    bundleDir: path.join(workspacePath, bundleRelativeDir),
    promptFile: path.join(workspacePath, promptRelativePath),
    uploadDir: uploadMeta.upload_dir,
    taskPackPath: resolveWorkspaceFile(workspacePath, taskPack.output_task_pack),
  });
  entry.next_user_action = handoffNextAction(resolvedAdapter, entry.upload_files.length);

  const readme = handoffReadme({
    candidateName: workspace.careerBaseConfig?.candidate?.full_name || 'Local user',
    adapterMeta,
    handoff: entry,
    workspacePath,
    uploadFiles: entry.upload_files,
    missingFiles: entry.missing_files,
  });

  writeTextFile(path.join(workspacePath, readmeRelativePath), readme);
  writeJsonFile(path.join(workspacePath, manifestRelativePath), {
    id: entry.id,
    assistant_id: entry.assistant_id,
    assistant_title: entry.assistant_title,
    adapter: entry.adapter,
    task_type: entry.task_type,
    task_title: entry.task_title,
    opportunity_id: entry.opportunity_id,
    opportunity_label: entry.opportunity_label,
    created_at: entry.created_at,
    workspace_path: workspacePath,
    bundle_dir: bundleRelativeDir,
    task_pack: entry.task_pack,
    task_pack_copy: entry.task_pack_copy,
    prompt_file: entry.prompt_file,
    readme_file: entry.readme_file,
    recommended_files: entry.recommended_files,
    upload_files: entry.upload_files,
    missing_files: entry.missing_files,
    launch_notes: entry.launch_notes,
    next_user_action: entry.next_user_action,
  });

  const queue = loadQueueState(workspacePath);
  queue.updated_at = createdAt;
  queue.tasks = [entry, ...(queue.tasks || [])].slice(0, MAX_QUEUE_ITEMS);
  saveQueueState(workspacePath, queue);

  return {
    adapter: resolvedAdapter,
    task_pack: taskPack,
    handoff: summarizeTaskEntry(workspacePath, entry),
    bridge: agentBridgeSnapshot(workspacePath),
  };
}

export function queueSourcingRun({ workspaceArg, assistantId = DEFAULT_ASSISTANT_ID, adapter }) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const assistant = resolveAssistantOption(assistantId);
  const resolvedAdapter = assistant.supported_modes.includes(adapter)
    ? adapter
    : assistant.recommended_mode;
  const adapterMeta = adapterDefinition(resolvedAdapter);
  const workspace = loadWorkspace(workspacePath);
  const taskPack = buildSourcingRunPack({
    workspaceArg: workspacePath,
    mode: resolvedAdapter,
  });

  const createdAt = new Date().toISOString();
  const handoffId = [
    timestampSlug(createdAt),
    'sourcing-run',
    slugify(taskPack.task_title),
  ].join('-');

  const bundleRelativeDir = path.join(OUTBOX_ROOT, handoffId);
  const bundlePath = path.join(workspacePath, bundleRelativeDir);
  ensureDir(bundlePath);

  const promptRelativePath = path.join(bundleRelativeDir, 'prompt.txt');
  const readmeRelativePath = path.join(bundleRelativeDir, 'README.md');
  const manifestRelativePath = path.join(bundleRelativeDir, 'manifest.json');
  const taskPackCopyRelativePath = path.join(bundleRelativeDir, 'task-pack.md');
  const queueTemplateRelativePath = path.join(bundleRelativeDir, 'sourcing-results-template.yml');

  writeTextFile(path.join(workspacePath, promptRelativePath), taskPack.prompt);
  copyFileWithMeta(
    resolveWorkspaceFile(workspacePath, taskPack.output_task_pack),
    path.join(workspacePath, taskPackCopyRelativePath)
  );
  writeTextFile(
    path.join(workspacePath, queueTemplateRelativePath),
    [
      '# Paste or write sourcing results in the workspace canonical file instead:',
      '# data/sourcing/candidates.yml',
      '#',
      '# This template is included for chat-only assistants that need a response contract.',
      taskPack.prompt,
    ].join('\n')
  );

  const uploadSourceFiles = resolvedAdapter === 'chat_upload'
    ? [taskPack.output_task_pack, path.join(bundleRelativeDir, 'sourcing-results-template.yml')]
    : [];
  const uploadMeta = copyUploadFiles(workspacePath, bundlePath, uploadSourceFiles);

  const entry = {
    id: handoffId,
    status: 'queued',
    adapter: resolvedAdapter,
    assistant_id: assistant.id,
    assistant_title: assistant.title,
    task_type: taskPack.task_type,
    task_title: taskPack.task_title,
    opportunity_id: null,
    opportunity_label: 'Sourcing run',
    created_at: createdAt,
    updated_at: createdAt,
    bundle_dir: bundleRelativeDir,
    task_pack: taskPack.output_task_pack,
    task_pack_copy: taskPackCopyRelativePath,
    prompt_file: promptRelativePath,
    readme_file: readmeRelativePath,
    manifest_file: manifestRelativePath,
    recommended_files: taskPack.recommended_files,
    upload_files: uploadMeta.copied,
    missing_files: uploadMeta.missing,
  };

  entry.launch_notes = resolvedAdapter === 'chat_upload'
    ? [
      `Open a new chat in ${assistant.title}.`,
      `Open the handoff folder at ${path.join(workspacePath, bundleRelativeDir)}.`,
      `Upload the prepared files inside ${uploadMeta.upload_dir} to your chat assistant.`,
      `Tell the assistant to return a YAML queue matching the included template.`,
      'Paste the returned YAML or markdown search report back into the dashboard import area if the assistant cannot write to the workspace directly.',
    ]
    : [
      `Open ${assistant.title} in the workspace and point it to ${resolveWorkspaceFile(workspacePath, taskPack.output_task_pack)}.`,
      `Have the assistant browse the web and write results into ${taskPack.queue_output_path}.`,
      `Ask it to also write the human-readable note at ${taskPack.review_output_path}.`,
      'Refresh the dashboard after the sourcing run completes to review and approve roles.',
    ];
  entry.next_user_action = resolvedAdapter === 'chat_upload'
    ? 'Ask your assistant to return a sourcing-results YAML block, then import that result back into the dashboard.'
    : 'Run the sourcing task in your connected assistant, then refresh the dashboard to review the discovered roles.';

  const readme = handoffReadme({
    candidateName: workspace.careerBaseConfig?.candidate?.full_name || 'Local user',
    adapterMeta,
    handoff: entry,
    workspacePath,
    uploadFiles: entry.upload_files,
    missingFiles: entry.missing_files,
  });

  writeTextFile(path.join(workspacePath, readmeRelativePath), readme);
  writeJsonFile(path.join(workspacePath, manifestRelativePath), {
    id: entry.id,
    assistant_id: entry.assistant_id,
    assistant_title: entry.assistant_title,
    adapter: entry.adapter,
    task_type: entry.task_type,
    task_title: entry.task_title,
    opportunity_id: null,
    opportunity_label: entry.opportunity_label,
    created_at: entry.created_at,
    workspace_path: workspacePath,
    bundle_dir: bundleRelativeDir,
    task_pack: entry.task_pack,
    task_pack_copy: entry.task_pack_copy,
    prompt_file: entry.prompt_file,
    readme_file: entry.readme_file,
    recommended_files: entry.recommended_files,
    upload_files: entry.upload_files,
    missing_files: entry.missing_files,
    launch_notes: entry.launch_notes,
    next_user_action: entry.next_user_action,
  });

  const queue = loadQueueState(workspacePath);
  queue.updated_at = createdAt;
  queue.tasks = [entry, ...(queue.tasks || [])].slice(0, MAX_QUEUE_ITEMS);
  saveQueueState(workspacePath, queue);

  return {
    adapter: resolvedAdapter,
    task_pack: taskPack,
    handoff: summarizeTaskEntry(workspacePath, entry),
    bridge: agentBridgeSnapshot(workspacePath),
  };
}

export function queueApplicationRun({ workspaceArg, runId, assistantId = DEFAULT_ASSISTANT_ID, adapter }) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const assistant = resolveAssistantOption(assistantId);
  const resolvedAdapter = assistant.supported_modes.includes(adapter)
    ? adapter
    : assistant.recommended_mode;
  const adapterMeta = adapterDefinition(resolvedAdapter);
  const workspace = loadWorkspace(workspacePath);
  const taskPack = buildApplicationRunPack({
    workspaceArg: workspacePath,
    runId,
    mode: resolvedAdapter,
  });

  const createdAt = new Date().toISOString();
  const handoffId = [
    timestampSlug(createdAt),
    slugify(taskPack.run.company),
    slugify(taskPack.run.role),
    slugify(taskPack.task_title),
  ].join('-');

  const bundleRelativeDir = path.join(OUTBOX_ROOT, handoffId);
  const bundlePath = path.join(workspacePath, bundleRelativeDir);
  ensureDir(bundlePath);

  const promptRelativePath = path.join(bundleRelativeDir, 'prompt.txt');
  const readmeRelativePath = path.join(bundleRelativeDir, 'README.md');
  const manifestRelativePath = path.join(bundleRelativeDir, 'manifest.json');
  const taskPackCopyRelativePath = path.join(bundleRelativeDir, 'task-pack.md');

  writeTextFile(path.join(workspacePath, promptRelativePath), taskPack.prompt);
  copyFileWithMeta(
    resolveWorkspaceFile(workspacePath, taskPack.output_task_pack),
    path.join(workspacePath, taskPackCopyRelativePath)
  );

  const uploadSourceFiles = resolvedAdapter === 'chat_upload'
    ? [taskPack.output_task_pack, ...taskPack.recommended_files]
    : [];
  const uploadMeta = copyUploadFiles(workspacePath, bundlePath, uploadSourceFiles);

  const entry = {
    id: handoffId,
    status: 'queued',
    adapter: resolvedAdapter,
    assistant_id: assistant.id,
    assistant_title: assistant.title,
    task_type: taskPack.task_type,
    task_title: taskPack.task_title,
    opportunity_id: taskPack.run.opportunity_id,
    opportunity_label: `${taskPack.run.company} - ${taskPack.run.role}`,
    created_at: createdAt,
    updated_at: createdAt,
    bundle_dir: bundleRelativeDir,
    task_pack: taskPack.output_task_pack,
    task_pack_copy: taskPackCopyRelativePath,
    prompt_file: promptRelativePath,
    readme_file: readmeRelativePath,
    manifest_file: manifestRelativePath,
    recommended_files: taskPack.recommended_files,
    upload_files: uploadMeta.copied,
    missing_files: uploadMeta.missing,
  };

  entry.launch_notes = resolvedAdapter === 'chat_upload'
    ? [
      `Open a new chat in ${assistant.title}.`,
      `Open the handoff folder at ${path.join(workspacePath, bundleRelativeDir)}.`,
      `Upload the prepared files inside ${uploadMeta.upload_dir} to your chat assistant.`,
      `Use the prompt in ${path.join(workspacePath, promptRelativePath)} and stop before final submit.`,
      'Return control to the human for all human-gated questions and the final submit step.',
    ]
    : [
      `Open ${assistant.title} in the workspace and point it to ${resolveWorkspaceFile(workspacePath, taskPack.output_task_pack)}.`,
      `Have the assistant open ${taskPack.run.portal.apply_url} and use the packet plus attachments.`,
      'It should stop for human-gated questions and before final submit.',
      'Refresh the dashboard after meaningful progress or when you are ready to mark the run submitted.',
    ];
  entry.next_user_action = resolvedAdapter === 'chat_upload'
    ? 'Use the uploaded packet to work through the application with your assistant, then stop before final submit.'
    : 'Launch the connected assistant and let it work through the live application until the final human review step.';

  const readme = handoffReadme({
    candidateName: workspace.careerBaseConfig?.candidate?.full_name || 'Local user',
    adapterMeta,
    handoff: entry,
    workspacePath,
    uploadFiles: entry.upload_files,
    missingFiles: entry.missing_files,
  });

  writeTextFile(path.join(workspacePath, readmeRelativePath), readme);
  writeJsonFile(path.join(workspacePath, manifestRelativePath), {
    id: entry.id,
    assistant_id: entry.assistant_id,
    assistant_title: entry.assistant_title,
    adapter: entry.adapter,
    task_type: entry.task_type,
    task_title: entry.task_title,
    opportunity_id: entry.opportunity_id,
    opportunity_label: entry.opportunity_label,
    created_at: entry.created_at,
    workspace_path: workspacePath,
    bundle_dir: bundleRelativeDir,
    task_pack: entry.task_pack,
    task_pack_copy: entry.task_pack_copy,
    prompt_file: entry.prompt_file,
    readme_file: entry.readme_file,
    recommended_files: entry.recommended_files,
    upload_files: entry.upload_files,
    missing_files: entry.missing_files,
    launch_notes: entry.launch_notes,
    next_user_action: entry.next_user_action,
  });

  const queue = loadQueueState(workspacePath);
  queue.updated_at = createdAt;
  queue.tasks = [entry, ...(queue.tasks || [])].slice(0, MAX_QUEUE_ITEMS);
  saveQueueState(workspacePath, queue);

  return {
    adapter: resolvedAdapter,
    task_pack: taskPack,
    handoff: summarizeTaskEntry(workspacePath, entry),
    bridge: agentBridgeSnapshot(workspacePath),
  };
}
