const CONNECTION_MODES = {
  folder_access: {
    id: 'folder_access',
    title: 'Connected workspace',
    description: 'The assistant can open the local repo or workspace directly.',
  },
  chat_upload: {
    id: 'chat_upload',
    title: 'Prepared upload bundle',
    description: 'The dashboard prepares the files and prompt, then the user uploads them into chat.',
  },
};

const ASSISTANTS = {
  chatgpt_desktop: {
    id: 'chatgpt_desktop',
    title: 'ChatGPT Desktop',
    summary: 'Best current default for many less-technical users.',
    audience: 'Choose this when you want a familiar desktop chat and the least setup friction.',
    recommended_mode: 'chat_upload',
    supported_modes: ['chat_upload'],
    badges: ['Beginner-friendly', 'Desktop chat', 'Recommended default'],
    why_this_path: 'Use the prepared upload bundle. The desktop product story is clear on file uploads and IDE help, while full MCP client support is documented in ChatGPT Developer Mode on the web beta rather than as the default desktop flow.',
    advanced_note: 'Remote MCP apps can stay an advanced future path, but they should not be the first-run story for non-technical users.',
    examples: ['Upload the bundle', 'Paste prompt.txt', 'Review drafts before reuse'],
    steps: {
      chat_upload: [
        'Generate the task in Job Hunter OS, then click Prepare Handoff.',
        'Open a fresh chat in ChatGPT Desktop for this task.',
        'Open the bundle folder and drag the prepared files into ChatGPT Desktop.',
        'Paste the prompt from prompt.txt or use the copied launch notes.',
        'Review the draft and manually confirm all human-gated answers before using anything.',
      ],
    },
  },
  claude_desktop_chat: {
    id: 'claude_desktop_chat',
    title: 'Claude Desktop Chat',
    summary: 'Good for users who want a regular desktop chat rather than a connected coding workspace.',
    audience: 'Choose this when you want Claude as a chat surface and do not need direct repo access.',
    recommended_mode: 'chat_upload',
    supported_modes: ['chat_upload'],
    badges: ['Desktop chat', 'Low setup', 'Human-reviewed'],
    why_this_path: 'Use the prepared upload bundle. Claude Desktop chat can support its own MCP configuration, but that is a different setup surface from Claude Code and is not the clearest default for this product.',
    advanced_note: 'If someone later switches to Claude Code, we can promote them to the connected workspace path without changing their Job Hunter OS data.',
    examples: ['Upload files into chat', 'Paste the task brief', 'Keep sensitive fields manual'],
    steps: {
      chat_upload: [
        'Generate the task in Job Hunter OS, then click Prepare Handoff.',
        'Open a fresh chat in Claude Desktop for this task.',
        'Open the handoff folder and upload the prepared files into Claude Desktop chat.',
        'Paste the prompt into the same conversation so Claude follows the product rules.',
        'Review every output manually and keep all sensitive answers human-confirmed.',
      ],
    },
  },
  claude_code: {
    id: 'claude_code',
    title: 'Claude Code',
    summary: 'Best for more technical users who want the assistant to read the workspace directly.',
    audience: 'Choose this when you want a connected local workspace instead of uploading bundles.',
    recommended_mode: 'folder_access',
    supported_modes: ['folder_access'],
    badges: ['Connected workspace', 'Strong local fit', 'Optional MCP later'],
    why_this_path: 'Use the connected workspace path. Claude Code and Claude Code Desktop share project files and `.mcp.json` configuration, so it is a strong fit for a local-first connected workflow.',
    advanced_note: 'MCP is valuable here, but as an enhancement to the connected workspace story rather than a replacement for it.',
    examples: ['Open the workspace directly', 'Read local files', 'Add MCP later if needed'],
    steps: {
      folder_access: [
        'Open the Job Hunter OS repo or workspace in Claude Code.',
        'Generate the task in Job Hunter OS, then click Prepare Handoff.',
        'Point Claude Code at the workspace or task-pack path so it reads the same local files as the dashboard.',
        'Approve risky actions and all human-gated fields before anything is reused or submitted.',
      ],
    },
  },
  codex: {
    id: 'codex',
    title: 'Codex',
    summary: 'Best for users who want a coding agent to work directly in the local workspace.',
    audience: 'Choose this when you want the shortest path from dashboard handoff to local agent execution.',
    recommended_mode: 'folder_access',
    supported_modes: ['folder_access'],
    badges: ['Connected workspace', 'Fast operator flow', 'Optional MCP later'],
    why_this_path: 'Use the connected workspace path. Codex already works well with direct local workspace access, so this keeps the handoff both simple and effective.',
    advanced_note: 'MCP can still help Codex reach outside systems later, but the core product story should remain local workspace first.',
    examples: ['Open the repo directly', 'Use the local handoff folder', 'Keep submissions human-approved'],
    steps: {
      folder_access: [
        'Open the Job Hunter OS repo or workspace in Codex.',
        'Generate the task in Job Hunter OS, then click Prepare Handoff.',
        'Use the handoff bundle as the starting point, then let Codex read the workspace files directly.',
        'Review all drafts and keep human-gated answers and submissions explicitly approved.',
      ],
    },
  },
};

export const DEFAULT_ASSISTANT_ID = 'chatgpt_desktop';

export function resolveAssistantOption(assistantId = DEFAULT_ASSISTANT_ID) {
  return ASSISTANTS[assistantId] || ASSISTANTS[DEFAULT_ASSISTANT_ID];
}

export function listAssistantOptions() {
  return Object.values(ASSISTANTS).map(assistant => ({
    id: assistant.id,
    title: assistant.title,
    summary: assistant.summary,
    audience: assistant.audience,
    recommended_mode: assistant.recommended_mode,
    supported_modes: assistant.supported_modes,
    badges: assistant.badges,
  }));
}

export function connectionModeMeta(mode) {
  return CONNECTION_MODES[mode] || CONNECTION_MODES.chat_upload;
}
