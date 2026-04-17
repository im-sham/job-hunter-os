#!/usr/bin/env node

import { spawn } from 'child_process';
import {
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

function openBrowser(url) {
  let command = null;
  let args = [];

  if (process.platform === 'darwin') {
    command = 'open';
    args = [url];
  } else if (process.platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

function main() {
  const workspaceArg = getFlag('--workspace') || 'workspace';
  const port = getFlag('--port') || '4173';
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const doctor = workspaceDoctor(workspacePath);

  if (!doctor.ok) {
    console.error(`Workspace is missing required files: ${workspacePath}`);
    console.error('Run `node scripts/bootstrap-workspace.mjs --workspace workspace` first.');
    process.exit(1);
  }

  const serverArgs = [
    'apps/dashboard/server.mjs',
    '--workspace',
    workspacePath,
    '--port',
    port,
  ];

  const child = spawn(process.execPath, serverArgs, {
    stdio: 'inherit',
  });

  if (hasFlag('--open')) {
    setTimeout(() => {
      openBrowser(`http://localhost:${port}`);
    }, 900);
  }

  child.on('exit', code => {
    process.exit(code ?? 0);
  });
}

main();
