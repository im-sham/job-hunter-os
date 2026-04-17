import {
  connectionModeMeta,
  DEFAULT_ASSISTANT_ID,
  listAssistantOptions,
  resolveAssistantOption,
} from '../../../packages/core/src/assistant-options.mjs';

function humanGateText(snapshot) {
  const gates = snapshot.human_gates || [];
  if (!gates.length) return 'No human-gated fields are configured yet, so treat all sensitive submission fields as manual review items.';
  return `Human-gated fields in this workspace: ${gates.join(', ')}. Never answer or submit those without explicit user confirmation.`;
}

function availableArtifactPaths(snapshot) {
  return (snapshot.artifacts || [])
    .filter(artifact => artifact.exists)
    .map(artifact => artifact.relative_path);
}

function nextActionText(snapshot) {
  const steps = snapshot.guidance?.next_actions || [];
  if (!steps.length) return 'Review the workspace and choose the most useful next onboarding action.';
  return steps
    .map(step => `${step.title}: ${step.next_step}`)
    .join(' ');
}

function formatList(items = []) {
  return items.length ? items.map(item => `- ${item}`).join('\n') : '- None yet';
}

function buildFolderPrompt(snapshot, assistant) {
  const artifactLines = formatList(availableArtifactPaths(snapshot));
  return [
    `You are helping inside Job Hunter OS for ${snapshot.meta.candidate_name} using ${assistant.title}.`,
    `Workspace path: ${snapshot.meta.workspace_path}`,
    '',
    'Start by reviewing the workspace status, imported materials, and any generated artifacts already present.',
    'Your goals are to tighten onboarding quality, refine reusable candidate materials, evaluate opportunities, and prepare draft application assets while keeping the workflow local-first.',
    '',
    `Current onboarding progress: ${snapshot.onboarding.completed}/${snapshot.onboarding.total} modules complete.`,
    `Current focus: ${snapshot.guidance?.current_focus || 'Onboarding review'}.`,
    nextActionText(snapshot),
    '',
    'Available generated artifacts:',
    artifactLines,
    '',
    'Rules:',
    '- Keep all work grounded in the local workspace files.',
    '- Do not auto-submit applications or trigger risky actions without explicit user approval.',
    '- Draft resumes, cover letters, evaluation notes, and submission prep as requested.',
    `- ${humanGateText(snapshot)}`,
  ].join('\n');
}

function buildChatPrompt(snapshot, assistant) {
  const artifactLines = formatList(availableArtifactPaths(snapshot));
  return [
    `You are helping with Job Hunter OS onboarding for ${snapshot.meta.candidate_name} using ${assistant.title}.`,
    '',
    'I will upload generated workspace artifacts and source materials from a local-first career operations tool.',
    'Use only the uploaded materials plus the instructions below. Do not assume direct filesystem or automation access.',
    '',
    `Current onboarding progress: ${snapshot.onboarding.completed}/${snapshot.onboarding.total} modules complete.`,
    `Current focus: ${snapshot.guidance?.current_focus || 'Onboarding review'}.`,
    nextActionText(snapshot),
    '',
    'Likely uploaded artifacts:',
    artifactLines,
    '',
    'Rules:',
    '- Help review, synthesize, and draft materials based on the uploaded files.',
    '- Suggest edits and missing information, but do not imply that anything has been submitted automatically.',
    `- ${humanGateText(snapshot)}`,
    '- Treat legal, EEO, work authorization, compensation disclosures, and other sensitive submission fields as human-confirmed inputs only.',
  ].join('\n');
}

function controlsForMode(mode) {
  if (mode === 'chat_upload') {
    return [
      'You decide what files to upload.',
      'You review every draft before reuse.',
      'You manually confirm all human-gated answers.',
    ];
  }

  return [
    'You keep the files local and in your control.',
    'You approve risky actions before they happen.',
    'You review all human-gated fields manually.',
  ];
}

export function buildAgentSetup(snapshot, options = {}) {
  const assistant = resolveAssistantOption(options.assistantId || DEFAULT_ASSISTANT_ID);
  const resolvedMode = assistant.supported_modes.includes(options.mode)
    ? options.mode
    : assistant.recommended_mode;
  const artifactPaths = availableArtifactPaths(snapshot);
  const modeMeta = connectionModeMeta(resolvedMode);

  return {
    assistant: {
      id: assistant.id,
      title: assistant.title,
      summary: assistant.summary,
      audience: assistant.audience,
      recommended_mode: assistant.recommended_mode,
      supported_modes: assistant.supported_modes,
      badges: assistant.badges,
      why_this_path: assistant.why_this_path,
      advanced_note: assistant.advanced_note,
    },
    assistant_options: listAssistantOptions(),
    available_modes: assistant.supported_modes.map(mode => connectionModeMeta(mode)),
    mode: resolvedMode,
    mode_meta: modeMeta,
    recommended_mode: assistant.recommended_mode,
    title: assistant.title,
    summary: `${assistant.summary} ${modeMeta.title} is the current productized path for this assistant.`,
    examples: assistant.examples || [],
    steps: assistant.steps?.[resolvedMode] || [],
    prompt: resolvedMode === 'chat_upload'
      ? buildChatPrompt(snapshot, assistant)
      : buildFolderPrompt(snapshot, assistant),
    user_controls: controlsForMode(resolvedMode),
    suggested_uploads: resolvedMode === 'chat_upload' ? artifactPaths : undefined,
    suggested_files: resolvedMode === 'folder_access' ? artifactPaths : undefined,
    workspace_path: resolvedMode === 'folder_access' ? snapshot.meta.workspace_path : undefined,
  };
}
