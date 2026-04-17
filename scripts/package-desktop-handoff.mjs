#!/usr/bin/env node

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { resolveWorkspacePath } from '../packages/core/src/workspace.mjs';

function latestDesktopArtifact(desktopDir, suffix) {
  const candidates = fs.readdirSync(desktopDir)
    .filter(fileName => fileName.endsWith(suffix))
    .map(fileName => {
      const absolutePath = path.join(desktopDir, fileName);
      return {
        fileName,
        absolutePath,
        mtimeMs: fs.statSync(absolutePath).mtimeMs,
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  if (!candidates.length) {
    return null;
  }

  return candidates[0];
}

function sha256ForFile(absolutePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
}

function handoffReadme({ dmgName, zipName }) {
  const primaryArtifact = dmgName ? `\`${dmgName}\`` : `\`${zipName}\``;
  const fallbackInstall = dmgName && zipName ? `
## Zip Fallback

If the DMG does not open cleanly on your machine, you can still use the zip:

1. Double-click \`${zipName}\` to unzip it.
2. Move \`Job Hunter OS.app\` into your Applications folder if you want.
3. Open \`Job Hunter OS.app\`.
` : '';

  return `# Job Hunter OS Desktop Tester Handoff

## What To Open

1. Double-click ${primaryArtifact}.
2. If you opened the DMG, drag \`Job Hunter OS.app\` into \`Applications\`.
3. Open \`Job Hunter OS.app\` from Applications or directly from the mounted installer window.

## Important macOS Note

This build is currently unsigned and not notarized.

If macOS blocks the first launch:

1. Right-click the app and choose \`Open\`.
2. If needed, go to \`System Settings -> Privacy & Security\` and choose \`Open Anyway\`.

## What The App Does

- creates a local workspace in \`~/Documents/Job Hunter OS Workspace\`
- opens a native app window for the dashboard
- keeps your workspace files local on your computer

${fallbackInstall}

## Suggested Test Flow

1. Import one or more resumes or LinkedIn exports.
2. Import two or more writing samples.
3. Click \`Build Everything\`.
4. Fill in Job Targets and Reusable Application Details.
5. Click \`Run Search With My Assistant\`.
6. Refresh and approve at least one sourced role into the pipeline.
7. Generate an agent task for that role.
8. Prepare a handoff for the assistant you actually use.
`;
}

function main() {
  const desktopDir = resolveWorkspacePath('dist/desktop');
  const handoffDir = path.join(desktopDir, 'handoff');
  const dmgArtifact = latestDesktopArtifact(desktopDir, '.dmg');
  const zipArtifact = latestDesktopArtifact(desktopDir, '-mac.zip');

  if (!dmgArtifact && !zipArtifact) {
    throw new Error('No desktop artifact found. Run `npm run desktop:package` first.');
  }

  fs.rmSync(handoffDir, { recursive: true, force: true });
  fs.mkdirSync(handoffDir, { recursive: true });
  const copiedArtifacts = [dmgArtifact, zipArtifact].filter(Boolean).map(artifact => {
    const destination = path.join(handoffDir, artifact.fileName);
    fs.copyFileSync(artifact.absolutePath, destination);
    return {
      type: artifact.fileName.endsWith('.dmg') ? 'dmg' : 'zip',
      file_name: artifact.fileName,
      absolute_path: destination,
      sha256: sha256ForFile(destination),
    };
  });

  fs.writeFileSync(
    path.join(handoffDir, 'START HERE - Desktop.md'),
    handoffReadme({
      dmgName: dmgArtifact?.fileName || '',
      zipName: zipArtifact?.fileName || '',
    })
  );
  fs.writeFileSync(
    path.join(handoffDir, 'checksums.txt'),
    copiedArtifacts.map(artifact => `${artifact.sha256}  ${artifact.file_name}`).join('\n') + '\n'
  );
  fs.writeFileSync(
    path.join(handoffDir, 'release-manifest.json'),
    JSON.stringify({
      recommended_artifact: dmgArtifact?.fileName || zipArtifact?.fileName || '',
      artifacts: copiedArtifacts,
    }, null, 2)
  );

  console.log(JSON.stringify({
    handoff_dir: handoffDir,
    recommended_artifact: path.join(handoffDir, dmgArtifact?.fileName || zipArtifact?.fileName || ''),
    desktop_dmg: dmgArtifact ? path.join(handoffDir, dmgArtifact.fileName) : '',
    desktop_zip: zipArtifact ? path.join(handoffDir, zipArtifact.fileName) : '',
  }, null, 2));
}

main();
