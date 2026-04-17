import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import {
  attachApplicationArtifact,
  buildApplicationRunPack,
  markApplicationSubmitted,
  setApplicationRunStatus,
  startApplicationRun,
} from '../packages/core/src/application-runs.mjs';
import { workspaceSnapshot } from '../packages/core/src/workspace.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoWorkspace = path.resolve(__dirname, '..', 'demo', 'workspace');

function tempWorkspace(prefix) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const workspace = path.join(tempRoot, 'workspace');
  fs.cpSync(demoWorkspace, workspace, { recursive: true });
  return workspace;
}

test('starting an application run creates a packet and checklist for the selected job', () => {
  const workspace = tempWorkspace('job-hunter-os-application-run-start-');

  const result = startApplicationRun({
    workspaceArg: workspace,
    opportunityId: 'demo-101',
  });

  const packetPath = path.join(workspace, result.run.packet_path);
  const checklistPath = path.join(workspace, result.run.checklist_path);

  assert.equal(result.run.company, 'Beacon AI');
  assert.equal(result.run.portal.type, 'greenhouse');
  assert.equal(result.run.status, 'needs_resume');
  assert.equal(fs.existsSync(packetPath), true);
  assert.equal(fs.existsSync(checklistPath), true);
  assert.match(fs.readFileSync(packetPath, 'utf-8'), /safe_prefill:/);
  assert.match(fs.readFileSync(checklistPath, 'utf-8'), /Manual Review Required/);
});

test('application runs can attach artifacts, generate fill help, and roll into submitted state', () => {
  const workspace = tempWorkspace('job-hunter-os-application-run-complete-');
  const started = startApplicationRun({
    workspaceArg: workspace,
    opportunityId: 'demo-101',
  });

  const resumePath = path.join(path.dirname(workspace), 'resume.pdf');
  const coverLetterPath = path.join(path.dirname(workspace), 'cover-letter.md');
  fs.writeFileSync(resumePath, 'resume-bytes');
  fs.writeFileSync(coverLetterPath, '# cover letter');

  assert.throws(() => buildApplicationRunPack({
    workspaceArg: workspace,
    runId: started.run.id,
  }), /Upload the final resume/i);

  const withResume = attachApplicationArtifact({
    workspaceArg: workspace,
    runId: started.run.id,
    artifactKind: 'resume',
    inputPath: resumePath,
    filename: 'resume.pdf',
  });

  const withCoverLetter = attachApplicationArtifact({
    workspaceArg: workspace,
    runId: started.run.id,
    artifactKind: 'cover_letter',
    inputPath: coverLetterPath,
    filename: 'cover-letter.md',
  });

  const handoff = buildApplicationRunPack({
    workspaceArg: workspace,
    runId: started.run.id,
    mode: 'chat_upload',
  });

  const reviewReady = setApplicationRunStatus({
    workspaceArg: workspace,
    runId: started.run.id,
    status: 'awaiting_final_confirmation',
    nextStep: 'Do the final human review before you submit.',
  });

  const submitted = markApplicationSubmitted({
    workspaceArg: workspace,
    runId: started.run.id,
  });

  const snapshot = workspaceSnapshot(workspace);
  const opportunity = snapshot.pipeline.opportunities.find(item => item.id === 'demo-101');

  assert.match(withResume.artifact, /resume\.pdf$/);
  assert.match(withCoverLetter.artifact, /cover-letter\.md$/);
  assert.equal(withResume.run.status, 'prepared');
  assert.equal(reviewReady.run.status, 'awaiting_final_confirmation');
  assert.match(handoff.prompt, /Never auto-submit/i);
  assert.equal(fs.existsSync(path.join(workspace, handoff.output_task_pack)), true);
  assert.equal(submitted.run.status, 'submitted');
  assert.equal(snapshot.applications.submitted_count, 1);
  assert.equal(opportunity.phase, 'submitted');
});

test('workspace snapshot includes browser assist review details for application runs', () => {
  const workspace = tempWorkspace('job-hunter-os-application-review-summary-');
  const started = startApplicationRun({
    workspaceArg: workspace,
    opportunityId: 'demo-101',
  });

  const sessionPath = path.join(workspace, 'data', 'applications', started.run.id, 'browser-assist-session.yml');
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(sessionPath, yaml.dump({
    version: 1,
    run_id: started.run.id,
    status: 'ready_for_final_review',
    current_url: started.run.portal.apply_url,
    portal: {
      id: 'greenhouse',
      name: 'Greenhouse',
    },
    next_step: 'Verify every answer manually before you submit.',
    auto_filled: [
      {
        field: 'Email',
        kind: 'safe_fill',
        source: 'email',
        value_preview: 'al...om',
      },
    ],
    manual_review_items: [
      {
        key: 'work_authorization',
        label: 'Work Authorization',
        reason: 'This answer must always be confirmed by the human before submission.',
      },
    ],
    unresolved_required_fields: [
      'Do you have legal authorization to work in Canada?',
    ],
    submit_buttons: ['Submit application'],
  }));

  const reviewReady = setApplicationRunStatus({
    workspaceArg: workspace,
    runId: started.run.id,
    status: 'awaiting_final_confirmation',
    nextStep: 'Do the final human review before you submit.',
  });

  const snapshot = workspaceSnapshot(workspace);
  const run = snapshot.applications.runs.find(item => item.id === started.run.id);

  assert.equal(reviewReady.run.status, 'awaiting_final_confirmation');
  assert.equal(run.review_summary.label, 'Final Review Ready');
  assert.equal(run.browser_assist_details.auto_filled.length, 1);
  assert.equal(run.browser_assist_details.manual_review_items.length, 1);
  assert.equal(run.browser_assist_details.unresolved_required_fields.length, 1);
});
