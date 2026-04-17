#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import {
  initWorkspace,
  resolveWorkspacePath,
  workspaceDoctor,
} from '../packages/core/src/workspace.mjs';

function getFlag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function isReadyWorkspace(workspacePath) {
  if (!fs.existsSync(workspacePath)) return false;
  const report = workspaceDoctor(workspacePath);
  return report.ok;
}

function ensureParentDir(workspacePath) {
  const parentDir = path.dirname(workspacePath);
  fs.mkdirSync(parentDir, { recursive: true });
}

function main() {
  const workspaceArg = getFlag('--workspace') || 'workspace';
  const force = hasFlag('--force');
  const demo = hasFlag('--demo');
  const workspacePath = resolveWorkspacePath(workspaceArg);

  if (isReadyWorkspace(workspacePath) && !force) {
    console.log(JSON.stringify({
      workspace_path: workspacePath,
      initialized: false,
      status: 'already_ready',
    }, null, 2));
    return;
  }

  ensureParentDir(workspacePath);
  const result = initWorkspace({
    workspaceArg: workspacePath,
    demo,
    force,
  });

  console.log(JSON.stringify({
    workspace_path: workspacePath,
    initialized: true,
    source: result.source,
    demo,
  }, null, 2));
}

main();
