import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  agentBridgeSnapshot,
  queueApplicationRun,
  queueAgentTask,
  queueSourcingRun,
} from '../packages/core/src/agent-bridge.mjs';
import {
  attachApplicationArtifact,
  startApplicationRun,
} from '../packages/core/src/application-runs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoWorkspace = path.resolve(__dirname, '..', 'demo', 'workspace');

function tempWorkspace(prefix) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const workspace = path.join(tempRoot, 'workspace');
  fs.cpSync(demoWorkspace, workspace, { recursive: true });
  return workspace;
}

test('folder-connected agent handoff creates queue metadata and local launch files', () => {
  const workspace = tempWorkspace('job-hunter-os-bridge-folder-');

  const result = queueAgentTask({
    workspaceArg: workspace,
    opportunityId: 'demo-101',
    taskType: 'evaluate_opportunity',
    assistantId: 'codex',
    adapter: 'folder_access',
  });

  const queuePath = path.join(workspace, 'data', 'agent-bridge', 'queue.yml');
  const bundlePath = result.handoff.absolute_bundle_dir;
  const readmePath = result.handoff.absolute_readme_file;
  const promptPath = result.handoff.absolute_prompt_file;
  const manifestPath = result.handoff.absolute_manifest_file;
  const taskPackCopyPath = result.handoff.absolute_task_pack_copy;
  const snapshot = agentBridgeSnapshot(workspace);

  assert.equal(fs.existsSync(queuePath), true);
  assert.equal(fs.existsSync(bundlePath), true);
  assert.equal(fs.existsSync(readmePath), true);
  assert.equal(fs.existsSync(promptPath), true);
  assert.equal(fs.existsSync(manifestPath), true);
  assert.equal(fs.existsSync(taskPackCopyPath), true);
  assert.equal(result.handoff.adapter, 'folder_access');
  assert.equal(result.handoff.assistant_title, 'Codex');
  assert.equal(result.handoff.upload_count, 0);
  assert.match(fs.readFileSync(readmePath, 'utf-8'), /Folder-Connected Agent/);
  assert.match(fs.readFileSync(promptPath, 'utf-8'), /Evaluate Opportunity/);
  assert.equal(snapshot.queued_count, 1);
  assert.equal(snapshot.latest_handoff?.adapter, 'folder_access');
});

test('chat upload adapter creates a ready-to-upload bundle with copied files', () => {
  const workspace = tempWorkspace('job-hunter-os-bridge-chat-');

  const result = queueAgentTask({
    workspaceArg: workspace,
    opportunityId: 'demo-101',
    taskType: 'draft_application_package',
    assistantId: 'chatgpt_desktop',
    adapter: 'chat_upload',
  });

  const uploadFiles = result.handoff.upload_files || [];
  const uploadPaths = uploadFiles.map(file => path.join(result.handoff.absolute_bundle_dir, file.bundle_relative_path));
  const promptPath = result.handoff.absolute_prompt_file;
  const readmePath = result.handoff.absolute_readme_file;
  const manifestPath = result.handoff.absolute_manifest_file;

  assert.equal(uploadFiles.length >= 3, true);
  assert.equal(result.handoff.assistant_title, 'ChatGPT Desktop');
  assert.equal(uploadPaths.every(filePath => fs.existsSync(filePath)), true);
  assert.match(fs.readFileSync(promptPath, 'utf-8'), /chat-only assistant/i);
  assert.match(fs.readFileSync(readmePath, 'utf-8'), /upload the files inside/i);
  assert.match(fs.readFileSync(manifestPath, 'utf-8'), /draft_application_package/);
  assert.equal(result.bridge.latest_handoff?.adapter, 'chat_upload');
  assert.equal(result.bridge.latest_handoff?.upload_count >= 3, true);
});

test('sourcing run handoff packages a search brief for connected assistants', () => {
  const workspace = tempWorkspace('job-hunter-os-bridge-sourcing-');

  const result = queueSourcingRun({
    workspaceArg: workspace,
    assistantId: 'codex',
    adapter: 'folder_access',
  });

  const promptPath = result.handoff.absolute_prompt_file;
  const readmePath = result.handoff.absolute_readme_file;
  const taskPackCopyPath = result.handoff.absolute_task_pack_copy;

  assert.equal(result.handoff.task_type, 'source_opportunities');
  assert.equal(result.handoff.opportunity_label, 'Sourcing run');
  assert.equal(fs.existsSync(promptPath), true);
  assert.equal(fs.existsSync(readmePath), true);
  assert.equal(fs.existsSync(taskPackCopyPath), true);
  assert.match(fs.readFileSync(promptPath, 'utf-8'), /Find jobs to review/i);
  assert.match(fs.readFileSync(readmePath, 'utf-8'), /write results into data\/sourcing\/candidates\.yml/i);
});

test('application run handoff packages live browser-fill help for chat assistants', () => {
  const workspace = tempWorkspace('job-hunter-os-bridge-application-');
  const started = startApplicationRun({
    workspaceArg: workspace,
    opportunityId: 'demo-101',
  });

  const resumePath = path.join(path.dirname(workspace), 'resume.pdf');
  fs.writeFileSync(resumePath, 'resume-bytes');

  attachApplicationArtifact({
    workspaceArg: workspace,
    runId: started.run.id,
    artifactKind: 'resume',
    inputPath: resumePath,
    filename: 'resume.pdf',
  });

  const result = queueApplicationRun({
    workspaceArg: workspace,
    runId: started.run.id,
    assistantId: 'chatgpt_desktop',
    adapter: 'chat_upload',
  });

  assert.equal(result.handoff.task_type, 'application_fill_help');
  assert.equal(result.handoff.assistant_title, 'ChatGPT Desktop');
  assert.equal(result.handoff.upload_count >= 3, true);
  assert.match(fs.readFileSync(result.handoff.absolute_prompt_file, 'utf-8'), /stop before final submit/i);
  assert.match(fs.readFileSync(result.handoff.absolute_readme_file, 'utf-8'), /sensitive fields as human-confirmed only/i);
});
