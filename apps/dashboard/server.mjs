#!/usr/bin/env node

import { startDashboardServer } from './lib/dashboard-server.mjs';

function getFlag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1];
}

const workspaceArg = getFlag('--workspace') || 'demo/workspace';
const port = Number(getFlag('--port') || 4173);
startDashboardServer({ workspaceArg, port })
  .then(({ port: actualPort }) => {
    console.log(`Job Hunter OS dashboard running at http://localhost:${actualPort}`);
    console.log(`Workspace: ${workspaceArg}`);
  })
  .catch(error => {
    console.error(error.stack || String(error));
    process.exit(1);
  });
