#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import {
  initWorkspace,
  workspaceDoctor,
  workspaceSnapshot,
} from './workspace.mjs';
import {
  buildCareerBaseArtifacts,
  buildOnboardingArtifacts,
  buildVoiceCalibrationArtifacts,
} from './onboarding-builders.mjs';
import {
  importCareerSource,
  importWritingSample,
} from './importers.mjs';
import {
  agentBridgeSnapshot,
  queueApplicationRun,
  queueAgentTask,
  queueSourcingRun,
} from './agent-bridge.mjs';
import {
  attachApplicationArtifact,
  buildApplicationRunPack,
  markApplicationSubmitted,
  startApplicationRun,
} from './application-runs.mjs';
import {
  browserAssistStatus,
  runBrowserAssist,
} from './browser-assist.mjs';
import {
  approveSourcedCandidate,
  dismissSourcedCandidate,
  sourceOpportunities,
} from './opportunity-sourcing.mjs';

function usage() {
  console.log(`Job Hunter OS CLI

Commands:
  init --workspace <path> [--demo] [--force]
  summary --workspace <path> [--json]
  doctor --workspace <path> [--json]
  import-career-source --workspace <path> --input <file> [--kind <resume|linkedin|bio|other>] [--label <slug>]
  import-writing-sample --workspace <path> --input <file> [--label <slug>]
  build-career-base --workspace <path>
  build-voice-profile --workspace <path>
  build-onboarding --workspace <path>
  source-opportunities --workspace <path> --input <file> [--source-label <label>] [--source-url <url>]
  approve-sourced-candidate --workspace <path> --candidate <id>
  dismiss-sourced-candidate --workspace <path> --candidate <id> [--reason <text>]
  start-application-run --workspace <path> --opportunity <id> [--apply-url <url>]
  upload-application-artifact --workspace <path> --run <id> --kind <resume|cover_letter> --input <file>
  build-application-run-pack --workspace <path> --run <id> [--mode <folder_access|chat_upload>]
  browser-assist-status [--json]
  run-browser-assist --workspace <path> --run <id> [--headless] [--close-when-done]
  mark-application-submitted --workspace <path> --run <id>
  bridge-status --workspace <path> [--json]
  queue-agent-task --workspace <path> --opportunity <id> --task-type <evaluate_opportunity|draft_application_package|prepare_submission> [--assistant <chatgpt_desktop|claude_desktop_chat|claude_code|codex>] [--adapter <folder_access|chat_upload>]
  queue-sourcing-run --workspace <path> [--assistant <chatgpt_desktop|claude_desktop_chat|claude_code|codex>] [--adapter <folder_access|chat_upload>]
  queue-application-run --workspace <path> --run <id> [--assistant <chatgpt_desktop|claude_desktop_chat|claude_code|codex>] [--adapter <folder_access|chat_upload>]
`);
}

function getFlag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function printSummary(snapshot) {
  console.log(`${snapshot.meta.candidate_name}`);
  if (snapshot.meta.headline) {
    console.log(`${snapshot.meta.headline}`);
  }
  console.log('');
  console.log(`Onboarding: ${snapshot.onboarding.completed}/${snapshot.onboarding.total} complete`);
  for (const module of snapshot.onboarding.modules) {
    const marker = module.complete ? 'complete' : 'needs work';
    console.log(`- ${module.title}: ${marker} (${module.details})`);
  }
  console.log('');
  console.log(`Pipeline: ${snapshot.pipeline.total} opportunities`);
  console.log(`- Human-gated opportunities: ${snapshot.pipeline.human_gate_count}`);
  for (const [phase, count] of Object.entries(snapshot.pipeline.phase_counts)) {
    console.log(`- ${phase}: ${count}`);
  }
  console.log('');
  console.log(`Feedback events: ${snapshot.feedback.event_count}`);
  console.log(`- Human-reviewed calibration: ${snapshot.feedback.require_human_review ? 'enabled' : 'disabled'}`);
}

function printBridgeSummary(snapshot) {
  console.log(`Agent Bridge: ${snapshot.queued_count} queued handoff${snapshot.queued_count === 1 ? '' : 's'}`);
  for (const handoff of snapshot.recent_handoffs.slice(0, 5)) {
      console.log(`- ${handoff.task_title} (${handoff.adapter_title}) for ${handoff.opportunity_label}`);
      if (handoff.assistant_title) {
        console.log(`  Assistant: ${handoff.assistant_title}`);
      }
      console.log(`  ${handoff.next_user_action}`);
  }
}

async function main() {
  const command = process.argv[2];
  const workspace = getFlag('--workspace');
  const input = getFlag('--input');
  const opportunity = getFlag('--opportunity');
  const candidate = getFlag('--candidate');
  const run = getFlag('--run');
  const taskType = getFlag('--task-type');
  const json = hasFlag('--json');

  if (!command || command === 'help' || command === '--help') {
    usage();
    process.exit(command ? 0 : 1);
  }

  if (command === 'init') {
    if (!workspace) {
      usage();
      process.exit(1);
    }
    const result = initWorkspace({
      workspaceArg: workspace,
      demo: hasFlag('--demo'),
      force: hasFlag('--force'),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'summary') {
    if (!workspace) {
      usage();
      process.exit(1);
    }
    const snapshot = workspaceSnapshot(workspace);
    if (json) {
      console.log(JSON.stringify(snapshot, null, 2));
      return;
    }
    printSummary(snapshot);
    const bridge = agentBridgeSnapshot(workspace);
    console.log('');
    printBridgeSummary(bridge);
    return;
  }

  if (command === 'doctor') {
    if (!workspace) {
      usage();
      process.exit(1);
    }
    const report = workspaceDoctor(workspace);
    console.log(json ? JSON.stringify(report, null, 2) : JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  }

  if (command === 'import-career-source') {
    if (!workspace || !input) {
      usage();
      process.exit(1);
    }
    console.log(JSON.stringify(await importCareerSource({
      workspaceArg: workspace,
      inputPath: input,
      kind: getFlag('--kind') || 'resume',
      label: getFlag('--label') || '',
    }), null, 2));
    return;
  }

  if (command === 'import-writing-sample') {
    if (!workspace || !input) {
      usage();
      process.exit(1);
    }
    console.log(JSON.stringify(await importWritingSample({
      workspaceArg: workspace,
      inputPath: input,
      label: getFlag('--label') || '',
    }), null, 2));
    return;
  }

  if (command === 'build-career-base') {
    if (!workspace) {
      usage();
      process.exit(1);
    }
    console.log(JSON.stringify(buildCareerBaseArtifacts(workspace), null, 2));
    return;
  }

  if (command === 'build-voice-profile') {
    if (!workspace) {
      usage();
      process.exit(1);
    }
    console.log(JSON.stringify(buildVoiceCalibrationArtifacts(workspace), null, 2));
    return;
  }

  if (command === 'build-onboarding') {
    if (!workspace) {
      usage();
      process.exit(1);
    }
    console.log(JSON.stringify(buildOnboardingArtifacts(workspace), null, 2));
    return;
  }

  if (command === 'source-opportunities') {
    if (!workspace || !input) {
      usage();
      process.exit(1);
    }
    console.log(JSON.stringify(sourceOpportunities({
      workspaceArg: workspace,
      payload: {
        text: fs.readFileSync(input, 'utf-8'),
        source_label: getFlag('--source-label') || '',
        source_url: getFlag('--source-url') || '',
      },
    }), null, 2));
    return;
  }

  if (command === 'approve-sourced-candidate') {
    if (!workspace || !candidate) {
      usage();
      process.exit(1);
    }
    console.log(JSON.stringify(approveSourcedCandidate({
      workspaceArg: workspace,
      candidateId: candidate,
    }), null, 2));
    return;
  }

  if (command === 'dismiss-sourced-candidate') {
    if (!workspace || !candidate) {
      usage();
      process.exit(1);
    }
    console.log(JSON.stringify(dismissSourcedCandidate({
      workspaceArg: workspace,
      candidateId: candidate,
      reason: getFlag('--reason') || '',
    }), null, 2));
    return;
  }

  if (command === 'start-application-run') {
    if (!workspace || !opportunity) {
      usage();
      process.exit(1);
    }
    console.log(JSON.stringify(startApplicationRun({
      workspaceArg: workspace,
      opportunityId: opportunity,
      payload: {
        apply_url: getFlag('--apply-url') || '',
      },
    }), null, 2));
    return;
  }

  if (command === 'upload-application-artifact') {
    if (!workspace || !run || !input) {
      usage();
      process.exit(1);
    }
    console.log(JSON.stringify(attachApplicationArtifact({
      workspaceArg: workspace,
      runId: run,
      artifactKind: getFlag('--kind') || '',
      inputPath: input,
      filename: path.basename(input),
    }), null, 2));
    return;
  }

  if (command === 'build-application-run-pack') {
    if (!workspace || !run) {
      usage();
      process.exit(1);
    }
    console.log(JSON.stringify(buildApplicationRunPack({
      workspaceArg: workspace,
      runId: run,
      mode: getFlag('--mode') || 'folder_access',
    }), null, 2));
    return;
  }

  if (command === 'browser-assist-status') {
    const status = browserAssistStatus();
    console.log(JSON.stringify(status, null, 2));
    process.exit(status.available ? 0 : 1);
  }

  if (command === 'run-browser-assist') {
    if (!workspace || !run) {
      usage();
      process.exit(1);
    }
    console.log(JSON.stringify(await runBrowserAssist({
      workspaceArg: workspace,
      runId: run,
      headless: hasFlag('--headless'),
      keepOpen: !hasFlag('--close-when-done'),
    }), null, 2));
    return;
  }

  if (command === 'mark-application-submitted') {
    if (!workspace || !run) {
      usage();
      process.exit(1);
    }
    console.log(JSON.stringify(markApplicationSubmitted({
      workspaceArg: workspace,
      runId: run,
    }), null, 2));
    return;
  }

  if (command === 'bridge-status') {
    if (!workspace) {
      usage();
      process.exit(1);
    }
    const snapshot = agentBridgeSnapshot(workspace);
    if (json) {
      console.log(JSON.stringify(snapshot, null, 2));
      return;
    }
    printBridgeSummary(snapshot);
    return;
  }

  if (command === 'queue-agent-task') {
    if (!workspace || !opportunity || !taskType) {
      usage();
      process.exit(1);
    }
    console.log(JSON.stringify(queueAgentTask({
      workspaceArg: workspace,
      opportunityId: opportunity,
      taskType,
      assistantId: getFlag('--assistant') || '',
      adapter: getFlag('--adapter') || 'folder_access',
    }), null, 2));
    return;
  }

  if (command === 'queue-sourcing-run') {
    if (!workspace) {
      usage();
      process.exit(1);
    }
    console.log(JSON.stringify(queueSourcingRun({
      workspaceArg: workspace,
      assistantId: getFlag('--assistant') || '',
      adapter: getFlag('--adapter') || 'folder_access',
    }), null, 2));
    return;
  }

  if (command === 'queue-application-run') {
    if (!workspace || !run) {
      usage();
      process.exit(1);
    }
    console.log(JSON.stringify(queueApplicationRun({
      workspaceArg: workspace,
      runId: run,
      assistantId: getFlag('--assistant') || '',
      adapter: getFlag('--adapter') || 'folder_access',
    }), null, 2));
    return;
  }

  usage();
  process.exit(1);
}

main().catch(error => {
  console.error(error.stack || String(error));
  process.exit(1);
});
