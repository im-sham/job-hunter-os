import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { updateOpportunityPhase } from './workspace-editor.mjs';
import { loadWorkspace, resolveWorkspacePath } from './workspace.mjs';

const DEFAULT_RUNS_FILE = {
  version: 1,
  updated_at: null,
  runs: [],
};

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readYamlFile(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return yaml.load(fs.readFileSync(filePath, 'utf-8')) || fallback;
}

function writeYamlFile(filePath, value) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, yaml.dump(value, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  }));
}

function writeTextFile(filePath, value) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, value, 'utf-8');
}

function normalizeString(value = '') {
  return String(value || '').trim();
}

function slugify(value = '') {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function titleCase(value = '') {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, match => match.toUpperCase());
}

function humanizeFieldKey(key = '') {
  return titleCase(String(key || '').replace(/[_-]+/g, ' '));
}

export function applicationRunsFilePath(workspacePath) {
  return path.join(workspacePath, 'data', 'applications', 'runs.yml');
}

function applicationRunFolderRelative(runId) {
  return path.join('data', 'applications', runId);
}

function applicationRunFolderPath(workspacePath, runId) {
  return path.join(workspacePath, applicationRunFolderRelative(runId));
}

function relativeFromRunFolder(runId, fileName) {
  return path.join(applicationRunFolderRelative(runId), fileName);
}

function loadRunsState(workspacePath) {
  return readYamlFile(applicationRunsFilePath(workspacePath), DEFAULT_RUNS_FILE) || structuredClone(DEFAULT_RUNS_FILE);
}

function saveRunsState(workspacePath, value) {
  writeYamlFile(applicationRunsFilePath(workspacePath), value);
}

function nextRunId(state) {
  const ids = (state.runs || [])
    .map(run => Number(String(run.id || '').replace('run-', '')))
    .filter(Number.isFinite);
  const next = ids.length ? Math.max(...ids) + 1 : 1;
  return `run-${String(next).padStart(4, '0')}`;
}

function detectPortalType(url = '', sourceSite = '') {
  const lowerUrl = normalizeString(url).toLowerCase();
  const lowerSource = normalizeString(sourceSite).toLowerCase();
  if (lowerUrl.includes('greenhouse')) return 'greenhouse';
  if (lowerUrl.includes('ashbyhq')) return 'ashby';
  if (lowerUrl.includes('lever.co')) return 'lever';
  if (lowerUrl.includes('smartrecruiters')) return 'smartrecruiters';
  if (lowerUrl.includes('workday')) return 'workday';
  if (lowerUrl.includes('workable')) return 'workable';
  if (lowerSource.includes('greenhouse')) return 'greenhouse';
  if (lowerSource.includes('ashby')) return 'ashby';
  if (lowerSource.includes('lever')) return 'lever';
  if (lowerSource.includes('smartrecruiters')) return 'smartrecruiters';
  if (lowerSource.includes('workday')) return 'workday';
  if (lowerSource.includes('workable')) return 'workable';
  return lowerUrl ? 'manual' : 'unknown';
}

function candidateName(workspace) {
  return workspace.careerBaseConfig?.candidate?.full_name || 'Unknown Candidate';
}

function buildSafePrefillFields(workspace) {
  const profile = workspace.applicationProfile || {};
  const fields = [];
  const fullName = candidateName(workspace);
  if (fullName) {
    fields.push({
      key: 'full_name',
      label: 'Full name',
      value: fullName,
      source: 'candidate.full_name',
    });
  }

  const contact = profile.contact || {};
  const contactMappings = [
    ['email', 'Email', contact.email],
    ['phone', 'Phone', contact.phone],
    ['linkedin_url', 'LinkedIn URL', contact.linkedin_url],
    ['portfolio_url', 'Portfolio URL', contact.portfolio_url],
  ];

  for (const [key, label, value] of contactMappings) {
    if (!normalizeString(value)) continue;
    fields.push({
      key,
      label,
      value: normalizeString(value),
      source: `contact.${key}`,
    });
  }

  for (const [key, value] of Object.entries(profile.safe_answers || {})) {
    if (!normalizeString(value)) continue;
    fields.push({
      key,
      label: humanizeFieldKey(key),
      value: normalizeString(value),
      source: `safe_answers.${key}`,
    });
  }

  return fields;
}

function buildManualCheckpoints(workspace, run) {
  return Object.keys(workspace.applicationProfile?.human_gated_fields || {}).map(key => ({
    key,
    label: humanizeFieldKey(key),
    status: 'pending',
    reason: 'This answer must always be confirmed by the human before submission.',
    applies_to_run: run.id,
  }));
}

function statusForRun(run) {
  if (run.submitted_at) {
    return {
      status: 'submitted',
      next_step: 'Monitor for recruiter response and log the outcome.',
    };
  }

  if (!normalizeString(run.portal?.apply_url)) {
    return {
      status: 'needs_apply_url',
      next_step: 'Add the direct application link for this role before starting browser-fill help.',
    };
  }

  if (!normalizeString(run.artifacts?.resume)) {
    return {
      status: 'needs_resume',
      next_step: 'Upload the final resume you want to use for this application.',
    };
  }

  if (run.status === 'assistant_in_progress') {
    return {
      status: 'assistant_in_progress',
      next_step: 'Use the prepared assistant package to work through the application and stop before final submit.',
    };
  }

  if (run.status === 'awaiting_final_confirmation') {
    return {
      status: 'awaiting_final_confirmation',
      next_step: 'Complete the final human review, then submit when ready.',
    };
  }

  return {
    status: 'prepared',
    next_step: 'Launch assistant fill help or open the packet and work through the application manually.',
  };
}

function buildPacketYaml(run, workspace) {
  return {
    version: 1,
    run_id: run.id,
    opportunity_id: run.opportunity_id,
    company: run.company,
    role: run.role,
    candidate: candidateName(workspace),
    status: run.status,
    portal: run.portal,
    location: run.location || '',
    compensation: run.compensation || '',
    safe_prefill: run.safe_prefill || [],
    manual_checkpoints: run.manual_checkpoints || [],
    artifacts: run.artifacts || {},
    rules: [
      'Keep the workflow local-first.',
      'Use reusable safe answers where appropriate.',
      'Do not answer legal, EEO, work authorization, compensation, or other sensitive questions without explicit human confirmation.',
      'Do not click final submit without explicit human approval.',
    ],
    next_step: run.next_step,
  };
}

function buildChecklistMarkdown(run, workspace) {
  const safeFields = (run.safe_prefill || []).map(field => `- ${field.label}: ${field.value}`);
  const manualItems = (run.manual_checkpoints || []).map(item => `- ${item.label}: ${item.reason}`);
  const attachments = [
    run.artifacts?.resume ? `- Resume: ${run.artifacts.resume}` : '- Resume: missing',
    run.artifacts?.cover_letter ? `- Cover letter: ${run.artifacts.cover_letter}` : '- Cover letter: optional / not attached',
  ];

  return [
    `# Application Run - ${run.company} - ${run.role}`,
    '',
    `- Candidate: ${candidateName(workspace)}`,
    `- Status: ${titleCase(run.status)}`,
    `- Portal: ${titleCase(run.portal?.type || 'unknown')}`,
    `- Apply URL: ${run.portal?.apply_url || 'Missing'}`,
    `- Opportunity phase: ${run.phase || 'Unknown'}`,
    '',
    '## Next Step',
    '',
    `- ${run.next_step}`,
    '',
    '## Attachments',
    '',
    ...attachments,
    '',
    '## Safe Prefill Fields',
    '',
    ...(safeFields.length ? safeFields : ['- No reusable safe fields are configured yet.']),
    '',
    '## Manual Review Required',
    '',
    ...(manualItems.length ? manualItems : ['- No manual checkpoints are configured yet.']),
    '',
    '## Rules',
    '',
    '- Never auto-submit without explicit human confirmation.',
    '- Stop for all human-gated questions.',
    '- Keep the workspace local and treat this packet as the source of truth for browser-fill help.',
  ].join('\n');
}

function syncRunArtifacts(workspacePath, run, workspace) {
  const folderPath = applicationRunFolderPath(workspacePath, run.id);
  const packetRelativePath = relativeFromRunFolder(run.id, 'submission-packet.yml');
  const checklistRelativePath = relativeFromRunFolder(run.id, 'submission-checklist.md');

  writeYamlFile(path.join(workspacePath, packetRelativePath), buildPacketYaml(run, workspace));
  writeTextFile(path.join(workspacePath, checklistRelativePath), buildChecklistMarkdown(run, workspace));

  return {
    ...run,
    packet_path: packetRelativePath,
    checklist_path: checklistRelativePath,
    folder_path: applicationRunFolderRelative(run.id),
  };
}

function findOpportunity(workspace, opportunityId) {
  const opportunity = (workspace.opportunities?.opportunities || []).find(item => item.id === opportunityId);
  if (!opportunity) {
    throw new Error(`Opportunity not found: ${opportunityId}`);
  }
  return opportunity;
}

function upsertRun(state, run) {
  const others = (state.runs || []).filter(item => item.id !== run.id);
  return [run, ...others].sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')));
}

export function startApplicationRun({ workspaceArg, opportunityId, payload = {} }) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const workspace = loadWorkspace(workspacePath);
  const state = loadRunsState(workspacePath);
  const opportunity = findOpportunity(workspace, opportunityId);
  const now = new Date().toISOString();

  const existing = (state.runs || []).find(run => run.opportunity_id === opportunityId && run.status !== 'submitted');
  const baseRun = existing || {
    id: nextRunId(state),
    created_at: now,
    opportunity_id: opportunity.id,
    company: opportunity.company,
    role: opportunity.role,
    phase: opportunity.phase,
    location: opportunity.location || '',
    compensation: opportunity.compensation || '',
    portal: {
      apply_url: '',
      listing_url: '',
      type: 'unknown',
    },
    artifacts: {
      resume: '',
      cover_letter: '',
    },
    safe_prefill: buildSafePrefillFields(workspace),
    manual_checkpoints: [],
    last_handoff_id: '',
  };

  const applyUrl = normalizeString(payload.apply_url)
    || normalizeString(baseRun.portal?.apply_url)
    || normalizeString(opportunity.application_url)
    || normalizeString(opportunity.source_url);
  const listingUrl = normalizeString(payload.listing_url)
    || normalizeString(baseRun.portal?.listing_url)
    || normalizeString(opportunity.source_url)
    || applyUrl;

  let run = {
    ...baseRun,
    phase: opportunity.phase,
    location: opportunity.location || baseRun.location || '',
    compensation: opportunity.compensation || baseRun.compensation || '',
    portal: {
      apply_url: applyUrl,
      listing_url: listingUrl,
      type: detectPortalType(applyUrl || listingUrl, opportunity.source_site || opportunity.portal_type || ''),
    },
    safe_prefill: buildSafePrefillFields(workspace),
    manual_checkpoints: buildManualCheckpoints(workspace, baseRun),
    updated_at: now,
  };

  const statusInfo = statusForRun(run);
  run = {
    ...run,
    status: statusInfo.status,
    next_step: statusInfo.next_step,
  };
  run = syncRunArtifacts(workspacePath, run, workspace);

  saveRunsState(workspacePath, {
    version: Number(state.version || 1),
    updated_at: now,
    runs: upsertRun(state, run),
  });

  return {
    output: path.relative(workspacePath, applicationRunsFilePath(workspacePath)),
    output_packet: run.packet_path,
    output_checklist: run.checklist_path,
    run,
  };
}

function findRunOrThrow(state, runId) {
  const run = (state.runs || []).find(item => item.id === runId);
  if (!run) {
    throw new Error(`Application run not found: ${runId}`);
  }
  return run;
}

export function getApplicationRun({ workspaceArg, runId }) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const state = loadRunsState(workspacePath);
  return findRunOrThrow(state, runId);
}

export function attachApplicationArtifact({ workspaceArg, runId, artifactKind, inputPath, filename = '' }) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const workspace = loadWorkspace(workspacePath);
  const state = loadRunsState(workspacePath);
  const current = findRunOrThrow(state, runId);
  const now = new Date().toISOString();

  if (!['resume', 'cover_letter'].includes(artifactKind)) {
    throw new Error(`Unsupported application artifact kind: ${artifactKind}`);
  }

  const extension = path.extname(filename || inputPath || '') || '.pdf';
  const targetRelativePath = relativeFromRunFolder(
    runId,
    artifactKind === 'resume' ? `resume${extension}` : `cover-letter${extension}`
  );
  const targetPath = path.join(workspacePath, targetRelativePath);

  ensureParentDir(targetPath);
  fs.copyFileSync(inputPath, targetPath);

  let run = {
    ...current,
    artifacts: {
      ...(current.artifacts || {}),
      [artifactKind]: targetRelativePath,
    },
    updated_at: now,
  };
  const statusInfo = statusForRun(run);
  run = {
    ...run,
    status: statusInfo.status,
    next_step: statusInfo.next_step,
  };
  run = syncRunArtifacts(workspacePath, run, workspace);

  saveRunsState(workspacePath, {
    version: Number(state.version || 1),
    updated_at: now,
    runs: upsertRun(state, run),
  });

  return {
    output: path.relative(workspacePath, applicationRunsFilePath(workspacePath)),
    output_packet: run.packet_path,
    output_checklist: run.checklist_path,
    artifact: targetRelativePath,
    run,
  };
}

export function setApplicationRunStatus({ workspaceArg, runId, status, nextStep = '', handoffId = '' }) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const workspace = loadWorkspace(workspacePath);
  const state = loadRunsState(workspacePath);
  const current = findRunOrThrow(state, runId);
  const now = new Date().toISOString();

  let run = {
    ...current,
    status: normalizeString(status) || current.status,
    next_step: normalizeString(nextStep) || current.next_step,
    last_handoff_id: normalizeString(handoffId) || current.last_handoff_id || '',
    updated_at: now,
  };
  run = syncRunArtifacts(workspacePath, run, workspace);

  saveRunsState(workspacePath, {
    version: Number(state.version || 1),
    updated_at: now,
    runs: upsertRun(state, run),
  });

  return {
    output: path.relative(workspacePath, applicationRunsFilePath(workspacePath)),
    output_packet: run.packet_path,
    output_checklist: run.checklist_path,
    run,
  };
}

export function setApplicationRunBrowserAssist({
  workspaceArg,
  runId,
  browserAssist = {},
  status = '',
  nextStep = '',
}) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const workspace = loadWorkspace(workspacePath);
  const state = loadRunsState(workspacePath);
  const current = findRunOrThrow(state, runId);
  const now = new Date().toISOString();

  let run = {
    ...current,
    browser_assist: {
      ...(current.browser_assist || {}),
      ...(browserAssist || {}),
      updated_at: now,
    },
    updated_at: now,
  };

  if (normalizeString(status)) {
    run.status = normalizeString(status);
  }
  if (normalizeString(nextStep)) {
    run.next_step = normalizeString(nextStep);
  }

  run = syncRunArtifacts(workspacePath, run, workspace);

  saveRunsState(workspacePath, {
    version: Number(state.version || 1),
    updated_at: now,
    runs: upsertRun(state, run),
  });

  return {
    output: path.relative(workspacePath, applicationRunsFilePath(workspacePath)),
    output_packet: run.packet_path,
    output_checklist: run.checklist_path,
    run,
  };
}

export function markApplicationSubmitted({ workspaceArg, runId }) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const workspace = loadWorkspace(workspacePath);
  const state = loadRunsState(workspacePath);
  const current = findRunOrThrow(state, runId);
  const now = new Date().toISOString();

  let run = {
    ...current,
    submitted_at: now,
    status: 'submitted',
    next_step: 'Monitor for recruiter response and log the outcome.',
    updated_at: now,
  };
  run = syncRunArtifacts(workspacePath, run, workspace);

  saveRunsState(workspacePath, {
    version: Number(state.version || 1),
    updated_at: now,
    runs: upsertRun(state, run),
  });

  updateOpportunityPhase({
    workspaceArg: workspacePath,
    opportunityId: run.opportunity_id,
    phase: 'submitted',
    nextStep: 'Submission recorded. Watch for recruiter response and log the outcome.',
  });

  return {
    output: path.relative(workspacePath, applicationRunsFilePath(workspacePath)),
    output_packet: run.packet_path,
    output_checklist: run.checklist_path,
    run,
  };
}

export function buildApplicationRunPack({ workspaceArg, runId, mode = 'folder_access' }) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const state = loadRunsState(workspacePath);
  const workspace = loadWorkspace(workspacePath);
  const run = findRunOrThrow(state, runId);

  if (!normalizeString(run.portal?.apply_url)) {
    throw new Error('Add the application URL before launching application fill help.');
  }

  if (!normalizeString(run.artifacts?.resume)) {
    throw new Error('Upload the final resume before launching application fill help.');
  }

  const prompt = [
    `Prepare the live application for ${run.company} - ${run.role}.`,
    '',
    mode === 'chat_upload'
      ? 'You are operating as a chat-only assistant. Use only the uploaded files and do not assume direct filesystem access.'
      : `You are operating with local workspace access at ${workspacePath}. Read the packet and checklist from the workspace before acting.`,
    '',
    `Open application URL: ${run.portal.apply_url}`,
    `Portal type: ${run.portal.type}`,
    `Submission packet: ${run.packet_path}`,
    `Checklist: ${run.checklist_path}`,
    '',
    'Your job:',
    '- Read the packet and checklist first.',
    '- Use safe prefill answers where appropriate.',
    '- Stop and explicitly hand control back for all human-gated questions.',
    '- Stop before final submit and leave a clear final-review state.',
    '',
    'Rules:',
    '- Never auto-submit.',
    '- Never fabricate completion.',
    '- Keep all legal, EEO, work authorization, sponsorship, compensation, and similar answers human-confirmed only.',
  ].join('\n');

  const markdown = [
    `# Application Fill Help - ${run.company} - ${run.role}`,
    '',
    `- Candidate: ${candidateName(workspace)}`,
    `- Mode: ${mode === 'chat_upload' ? 'Chat-only assistant' : 'Folder-connected assistant'}`,
    `- Apply URL: ${run.portal.apply_url}`,
    `- Portal: ${titleCase(run.portal.type)}`,
    '',
    '## Recommended Files',
    '',
    `- ${run.packet_path}`,
    `- ${run.checklist_path}`,
    run.artifacts?.resume ? `- ${run.artifacts.resume}` : '- Resume missing',
    run.artifacts?.cover_letter ? `- ${run.artifacts.cover_letter}` : '- Cover letter optional / missing',
    '',
    '## Copyable Prompt',
    '',
    '```text',
    prompt,
    '```',
  ].join('\n');

  const outputTaskPack = relativeFromRunFolder(run.id, 'application-fill-handoff.md');
  writeTextFile(path.join(workspacePath, outputTaskPack), markdown);

  return {
    task_type: 'application_fill_help',
    task_title: 'Finish Application In Browser',
    run_id: run.id,
    created_at: new Date().toISOString(),
    output_task_pack: outputTaskPack,
    prompt,
    checklist: [
      'Open the live application URL.',
      'Use the packet and uploaded documents.',
      'Stop for all human-gated questions.',
      'Stop before final submit.',
    ],
    recommended_files: [
      run.packet_path,
      run.checklist_path,
      run.artifacts?.resume,
      run.artifacts?.cover_letter,
    ].filter(Boolean),
    run,
  };
}
