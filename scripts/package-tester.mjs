#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { resolveWorkspacePath } from '../packages/core/src/workspace.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const COPY_TARGETS = [
  'apps',
  'packages',
  'templates',
  'docs/tester-guide.md',
  'LICENSE',
  'NOTICE',
  'TRADEMARKS.md',
  'README.md',
  'package.json',
  'package-lock.json',
  '.gitignore',
  'scripts/bootstrap-workspace.mjs',
  'scripts/start-dashboard.mjs',
];

function getFlag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function copyTarget(relativePath, outputRoot) {
  const sourcePath = path.join(REPO_ROOT, relativePath);
  const targetPath = path.join(outputRoot, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.cpSync(sourcePath, targetPath, { recursive: true, force: true });
}

function writeFile(outputRoot, relativePath, contents, mode = 0o644) {
  const targetPath = path.join(outputRoot, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, contents);
  fs.chmodSync(targetPath, mode);
}

function createStartHere() {
  return `# Job Hunter OS Tester Bundle

This bundle is for a guided local alpha test.

## Start Here

1. Double-click \`start.command\`.
2. Wait for the first dependency install.
3. The dashboard should open automatically at \`http://localhost:4173\`.
4. Stay in the dashboard for the full test. You should not need to edit workspace files directly.

## What To Try First

1. Choose your assistant.
2. Import background material and writing samples.
3. Click \`Build Everything\`.
4. Fill in \`Choose Your Job Targets\`.
5. Fill in \`Save Reusable Application Details\`.
6. Click \`Run Search With My Assistant\`.
7. Approve at least one role into the pipeline.
8. Click \`Prepare Assistant Package\`.
9. Continue into the application flow and stop at final human review.

## Important Notes

- Your local workspace lives in the \`workspace/\` folder inside this bundle.
- Sensitive fields should remain human-reviewed.
- If you want to start over, double-click \`reset-workspace.command\`.
- This bundle requires \`Node.js\` on the machine.

Full guidance is available in \`docs/tester-guide.md\`.
`;
}

function createStartScript() {
  return `#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required to run Job Hunter OS."
  echo "Install Node.js from https://nodejs.org/ and then run this file again."
  if command -v open >/dev/null 2>&1; then
    open "https://nodejs.org/en/download"
  fi
  read -r -n 1 -s -p "Press any key to close..."
  echo
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to install dependencies."
  read -r -n 1 -s -p "Press any key to close..."
  echo
  exit 1
fi

echo "Installing local dependencies if needed..."
npm install --omit=dev --no-fund --no-audit

echo "Ensuring workspace exists..."
node scripts/bootstrap-workspace.mjs --workspace workspace

echo "Launching Job Hunter OS dashboard..."
node scripts/start-dashboard.mjs --workspace workspace --port 4173 --open
`;
}

function createResetScript() {
  return `#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required to reset the workspace."
  exit 1
fi

node scripts/bootstrap-workspace.mjs --workspace workspace --force
echo "Workspace reset to the starter template."
`;
}

function buildArchive(outputRoot, archivePath) {
  const parentDir = path.dirname(outputRoot);
  const baseName = path.basename(outputRoot);
  const result = spawnSync('zip', ['-rq', archivePath, baseName], {
    cwd: parentDir,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`Failed to create zip archive: ${archivePath}`);
  }
}

function main() {
  const defaultOutput = resolveWorkspacePath('dist/job-hunter-os-tester');
  const outputRoot = resolveWorkspacePath(getFlag('--output') || defaultOutput);
  const archivePath = getFlag('--archive') || `${outputRoot}.zip`;
  const includeArchive = !hasFlag('--no-archive');

  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });

  for (const target of COPY_TARGETS) {
    copyTarget(target, outputRoot);
  }

  fs.cpSync(
    path.join(REPO_ROOT, 'templates', 'workspace'),
    path.join(outputRoot, 'workspace'),
    { recursive: true, force: true }
  );

  writeFile(outputRoot, 'START HERE.md', createStartHere());
  writeFile(outputRoot, 'start.sh', createStartScript(), 0o755);
  writeFile(outputRoot, 'start.command', '#!/bin/bash\nexec "$(dirname "$0")/start.sh"\n', 0o755);
  writeFile(outputRoot, 'reset-workspace.sh', createResetScript(), 0o755);
  writeFile(
    outputRoot,
    'reset-workspace.command',
    '#!/bin/bash\nexec "$(dirname "$0")/reset-workspace.sh"\n',
    0o755
  );

  if (includeArchive) {
    fs.rmSync(archivePath, { force: true });
    buildArchive(outputRoot, archivePath);
  }

  console.log(JSON.stringify({
    output_root: outputRoot,
    archive_path: includeArchive ? archivePath : null,
    workspace_path: path.join(outputRoot, 'workspace'),
  }, null, 2));
}

main();
