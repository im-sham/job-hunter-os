import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import { workspaceSnapshot } from '../packages/core/src/workspace.mjs';
import { buildAgentSetup } from '../apps/dashboard/lib/agent-setup.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoWorkspace = path.resolve(__dirname, '..', 'demo', 'workspace');

test('folder-connected agent setup includes workspace path and human-gated rules', () => {
  const snapshot = workspaceSnapshot(demoWorkspace);
  const setup = buildAgentSetup(snapshot, {
    assistantId: 'claude_code',
    mode: 'folder_access',
  });

  assert.equal(setup.mode, 'folder_access');
  assert.equal(setup.assistant.title, 'Claude Code');
  assert.equal(setup.recommended_mode, 'folder_access');
  assert.match(setup.assistant.why_this_path, /\.mcp\.json/i);
  assert.match(setup.prompt, /Workspace path:/);
  assert.match(setup.prompt, /Never answer or submit those without explicit user confirmation/i);
  assert.ok(setup.suggested_files.length >= 2);
});

test('chat-only agent setup avoids filesystem assumptions and recommends uploads', () => {
  const snapshot = workspaceSnapshot(demoWorkspace);
  const setup = buildAgentSetup(snapshot, {
    assistantId: 'chatgpt_desktop',
    mode: 'chat_upload',
  });

  assert.equal(setup.mode, 'chat_upload');
  assert.equal(setup.assistant.title, 'ChatGPT Desktop');
  assert.equal(setup.recommended_mode, 'chat_upload');
  assert.match(setup.assistant.why_this_path, /web beta/i);
  assert.match(setup.prompt, /Do not assume direct filesystem or automation access/i);
  assert.ok(setup.suggested_uploads.length >= 2);
});
