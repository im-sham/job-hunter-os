#!/usr/bin/env node

import { runBrowserAssist } from './browser-assist.mjs';

function getArg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

async function main() {
  const workspaceArg = getArg('--workspace');
  const runId = getArg('--run');
  const headless = process.argv.includes('--headless');
  const keepOpen = !process.argv.includes('--close-when-done');

  if (!workspaceArg || !runId) {
    throw new Error('Usage: node browser-assist-worker.mjs --workspace <path> --run <id> [--headless] [--close-when-done]');
  }

  const result = await runBrowserAssist({
    workspaceArg,
    runId,
    headless,
    keepOpen,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.error(error.stack || String(error));
  process.exit(1);
});
