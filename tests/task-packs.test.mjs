import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildTaskPack } from '../packages/core/src/task-packs.mjs';
import { workspaceSnapshot } from '../packages/core/src/workspace.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoWorkspace = path.resolve(__dirname, '..', 'demo', 'workspace');

test('task packs generate workspace markdown artifacts for selected opportunities', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'job-hunter-os-task-pack-'));
  const tempWorkspace = path.join(tempRoot, 'workspace');
  fs.cpSync(demoWorkspace, tempWorkspace, { recursive: true });

  const result = buildTaskPack({
    workspaceArg: tempWorkspace,
    opportunityId: 'demo-101',
    taskType: 'draft_application_package',
    mode: 'folder_access',
  });

  const outputPath = path.join(tempWorkspace, result.output_task_pack);
  const snapshot = workspaceSnapshot(tempWorkspace);

  assert.equal(fs.existsSync(outputPath), true);
  assert.match(fs.readFileSync(outputPath, 'utf-8'), /Draft Resume And Cover Letter/);
  assert.match(fs.readFileSync(outputPath, 'utf-8'), /Recommended Files/);
  assert.match(result.prompt, /Beacon AI - Strategic Operations Lead/);
  assert.ok(result.recommended_files.includes('data/career-base/master-experience.generated.md'));
  assert.equal(snapshot.artifacts.some(artifact => artifact.relative_path === result.output_task_pack), true);
});
