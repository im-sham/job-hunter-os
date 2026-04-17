import fs from 'fs';
import path from 'path';
import { loadWorkspace, resolveWorkspacePath } from './workspace.mjs';
import { recommendationForScore, scoreOpportunity } from './state-machine.mjs';

const TASK_TYPES = {
  evaluate_opportunity: {
    title: 'Evaluate Opportunity',
    slug: 'evaluate-opportunity',
    summary: 'Assess fit, upside, risks, and whether this role deserves immediate investment.',
  },
  draft_application_package: {
    title: 'Draft Resume And Cover Letter',
    slug: 'draft-application-package',
    summary: 'Draft a tailored resume strategy and a first-pass cover letter for the selected role.',
  },
  prepare_submission: {
    title: 'Prepare Submission',
    slug: 'prepare-submission',
    summary: 'Package the final checklist, safe-answer usage, and human-gated review needed before submission.',
  },
};

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeTextFile(filePath, value) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, value);
}

function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'task-pack';
}

function artifactByKey(workspacePath, key) {
  const candidates = {
    career_base_draft: path.join('data', 'career-base', 'master-experience.generated.md'),
    voice_guide: path.join('data', 'voice', 'voice-guide.generated.md'),
    voice_analysis: path.join('data', 'voice', 'voice-analysis.yml'),
    career_base_report: path.join('data', 'career-base', 'career-base-build.yml'),
  };
  const relativePath = candidates[key];
  if (!relativePath) return null;
  const absolutePath = path.join(workspacePath, relativePath);
  if (!fs.existsSync(absolutePath)) return null;
  return relativePath;
}

function summarizeOpportunity(opportunity, searchStrategy) {
  const priorityScore = scoreOpportunity(opportunity, searchStrategy);
  return {
    ...opportunity,
    priority_score: priorityScore,
    recommendation: recommendationForScore(priorityScore, searchStrategy),
  };
}

function safeAnswerLines(applicationProfile = {}) {
  return Object.entries(applicationProfile.safe_answers || {})
    .map(([key, value]) => `- ${key}: ${value}`);
}

function humanGateLines(applicationProfile = {}) {
  return Object.keys(applicationProfile.human_gated_fields || {})
    .map(key => `- ${key}`);
}

function listOrFallback(items = [], fallback = '- None noted') {
  return items.length ? items.join('\n') : fallback;
}

function modeIntro(mode, workspacePath) {
  if (mode === 'chat_upload') {
    return [
      'You are operating as a chat-only assistant without direct filesystem access.',
      'Use only the uploaded files, the role details below, and the instructions in this task pack.',
      'Do not claim to have submitted anything or accessed any local files automatically.',
    ].join('\n');
  }

  return [
    `You are operating with local workspace access at ${workspacePath}.`,
    'Read the referenced files directly from the workspace before drafting or recommending actions.',
    'Do not auto-submit anything or complete risky actions without explicit human approval.',
  ].join('\n');
}

function taskChecklist(taskType, opportunity) {
  if (taskType === 'evaluate_opportunity') {
    return [
      'Assess fit, upside, and likely interview odds for this specific role.',
      'Call out the strongest evidence from the candidate background that supports the role.',
      'Flag the biggest risks, weak spots, or missing data.',
      'Recommend one of: pursue now, selective pursue, or hold, with reasoning.',
    ];
  }

  if (taskType === 'draft_application_package') {
    return [
      'Choose the most relevant experience and strengths for this role.',
      'Outline the tailored resume emphasis before drafting bullets or sections.',
      'Draft a concise cover letter that matches the calibrated voice.',
      'List any missing information the human should confirm before use.',
    ];
  }

  return [
    'Prepare the final pre-submission checklist for this role.',
    'Use reusable safe answers where appropriate and do not invent sensitive answers.',
    'Explicitly separate safe-to-prefill fields from human-gated fields.',
    'Identify what still requires human confirmation before submission can proceed.',
  ];
}

function recommendedArtifacts(taskType, workspacePath) {
  const base = [artifactByKey(workspacePath, 'career_base_draft')].filter(Boolean);

  if (taskType === 'evaluate_opportunity') {
    return [
      ...base,
      path.join('config', 'search-strategy.yml'),
      path.join('data', 'pipeline', 'opportunities.yml'),
    ];
  }

  if (taskType === 'draft_application_package') {
    return [
      ...base,
      artifactByKey(workspacePath, 'voice_guide'),
      artifactByKey(workspacePath, 'voice_analysis'),
    ].filter(Boolean);
  }

  return [
    ...base,
    artifactByKey(workspacePath, 'voice_guide'),
    path.join('config', 'application-profile.yml'),
  ].filter(Boolean);
}

function buildPrompt({ mode, workspacePath, opportunity, searchStrategy, applicationProfile, taskType, candidateName }) {
  const checklist = taskChecklist(taskType, opportunity).map(item => `- ${item}`).join('\n');
  const safeAnswers = safeAnswerLines(applicationProfile);
  const humanGates = humanGateLines(applicationProfile);

  return [
    `${TASK_TYPES[taskType].title} for ${opportunity.company} - ${opportunity.role}`,
    '',
    modeIntro(mode, workspacePath),
    '',
    `Candidate: ${candidateName}`,
    `Role: ${opportunity.role}`,
    `Company: ${opportunity.company}`,
    `Current phase: ${opportunity.phase}`,
    `Priority score: ${opportunity.priority_score}`,
    `Recommendation band: ${opportunity.recommendation}`,
    `Lane: ${opportunity.strategy?.lane || 'Unassigned'}`,
    `Stage: ${opportunity.strategy?.company_stage || 'Unknown'}`,
    `Work mode: ${opportunity.strategy?.work_mode || 'Unknown'}`,
    `Suggested next step: ${opportunity.next_step || 'Review and decide next move.'}`,
    '',
    'Role-specific instructions:',
    checklist,
    '',
    'Search strategy context:',
    `- Target base: $${Number(searchStrategy?.compensation?.target_base_usd || 0).toLocaleString()}`,
    `- Exception floor: $${Number(searchStrategy?.compensation?.exception_floor_usd || 0).toLocaleString()}`,
    `- Work mode preferences: ${(searchStrategy?.work_mode_preferences || []).join(', ') || 'Not set'}`,
    '',
    'Reusable safe answers:',
    listOrFallback(safeAnswers, '- No safe answers configured yet'),
    '',
    'Human-gated fields:',
    listOrFallback(humanGates, '- No human-gated fields configured yet'),
    '',
    'Rules:',
    '- Keep the workflow local-first and grounded in the referenced workspace materials.',
    '- Do not auto-submit or imply anything has been submitted.',
    '- Treat legal, EEO, work authorization, compensation, and similar sensitive fields as human-confirmed only.',
    '- If key information is missing, list what the human should provide next.',
  ].join('\n');
}

function buildMarkdown({
  mode,
  workspacePath,
  taskType,
  opportunity,
  candidateName,
  recommendedFiles,
  prompt,
  applicationProfile,
}) {
  const safeAnswers = safeAnswerLines(applicationProfile);
  const humanGates = humanGateLines(applicationProfile);
  const checklist = taskChecklist(taskType, opportunity);

  return [
    `# ${TASK_TYPES[taskType].title}`,
    '',
    `- Candidate: ${candidateName}`,
    `- Company: ${opportunity.company}`,
    `- Role: ${opportunity.role}`,
    `- Mode: ${mode === 'chat_upload' ? 'Chat-only agent' : 'Folder-connected agent'}`,
    `- Phase: ${opportunity.phase}`,
    `- Recommendation: ${opportunity.recommendation}`,
    `- Priority score: ${opportunity.priority_score}`,
    '',
    '## Recommended Files',
    '',
    listOrFallback(recommendedFiles.map(file => `- ${file}`)),
    '',
    '## Checklist',
    '',
    listOrFallback(checklist.map(item => `- ${item}`)),
    '',
    '## Safe Answers',
    '',
    listOrFallback(safeAnswers, '- No reusable safe answers configured yet'),
    '',
    '## Human-Gated Fields',
    '',
    listOrFallback(humanGates, '- No human-gated fields configured yet'),
    '',
    '## Copyable Prompt',
    '',
    '```text',
    prompt,
    '```',
    '',
    `Workspace path: ${workspacePath}`,
    '',
  ].join('\n');
}

export function buildTaskPack({ workspaceArg, opportunityId, taskType, mode = 'folder_access' }) {
  if (!TASK_TYPES[taskType]) {
    throw new Error(`Unsupported task type: ${taskType}`);
  }

  const workspacePath = resolveWorkspacePath(workspaceArg);
  const workspace = loadWorkspace(workspaceArg);
  const opportunity = (workspace.opportunities?.opportunities || []).find(item => item.id === opportunityId);

  if (!opportunity) {
    throw new Error(`Opportunity not found: ${opportunityId}`);
  }

  const enrichedOpportunity = summarizeOpportunity(opportunity, workspace.searchStrategy || {});
  const candidateName = workspace.careerBaseConfig?.candidate?.full_name || 'Unknown Candidate';
  const recommendedFiles = recommendedArtifacts(taskType, workspacePath);
  const prompt = buildPrompt({
    mode,
    workspacePath,
    opportunity: enrichedOpportunity,
    searchStrategy: workspace.searchStrategy || {},
    applicationProfile: workspace.applicationProfile || {},
    taskType,
    candidateName,
  });

  const markdown = buildMarkdown({
    mode,
    workspacePath,
    taskType,
    opportunity: enrichedOpportunity,
    candidateName,
    recommendedFiles,
    prompt,
    applicationProfile: workspace.applicationProfile || {},
  });

  const slug = `${slugify(enrichedOpportunity.company)}-${slugify(enrichedOpportunity.role)}-${TASK_TYPES[taskType].slug}`;
  const relativePath = path.join('data', 'agent-tasks', `${slug}.md`);
  const absolutePath = path.join(workspacePath, relativePath);
  writeTextFile(absolutePath, markdown);

  return {
    task_type: taskType,
    task_title: TASK_TYPES[taskType].title,
    task_summary: TASK_TYPES[taskType].summary,
    mode,
    opportunity: {
      id: enrichedOpportunity.id,
      company: enrichedOpportunity.company,
      role: enrichedOpportunity.role,
      phase: enrichedOpportunity.phase,
      priority_score: enrichedOpportunity.priority_score,
      recommendation: enrichedOpportunity.recommendation,
      human_gate: Boolean(enrichedOpportunity.human_gate),
      next_step: enrichedOpportunity.next_step,
      strategy: enrichedOpportunity.strategy || {},
    },
    checklist: taskChecklist(taskType, enrichedOpportunity),
    recommended_files: recommendedFiles,
    prompt,
    output_task_pack: relativePath,
  };
}
