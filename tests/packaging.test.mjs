import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import test from 'node:test';

test('tester packaging script creates a starter bundle with launchers', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'job-hunter-os-package-'));
  const outputRoot = path.join(tempRoot, 'bundle');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, '..');

  execFileSync(process.execPath, [
    path.join(repoRoot, 'scripts/package-tester.mjs'),
    '--output',
    outputRoot,
    '--no-archive',
  ], { cwd: repoRoot });

  assert.equal(fs.existsSync(path.join(outputRoot, 'start.command')), true);
  assert.equal(fs.existsSync(path.join(outputRoot, 'reset-workspace.command')), true);
  assert.equal(fs.existsSync(path.join(outputRoot, 'workspace/config/career-base.yml')), true);
  assert.equal(fs.existsSync(path.join(outputRoot, 'docs/tester-guide.md')), true);
  assert.equal(fs.existsSync(path.join(outputRoot, 'scripts/start-dashboard.mjs')), true);
  assert.equal(fs.existsSync(path.join(outputRoot, 'README.md')), true);
  assert.match(
    fs.readFileSync(path.join(outputRoot, 'start.sh'), 'utf-8'),
    /npm install --omit=dev --no-fund --no-audit/
  );
});
