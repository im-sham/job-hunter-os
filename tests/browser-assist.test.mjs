import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  browserAssistStatus,
  detectBrowserAssistPortal,
  needsOpenApplyStep,
  resolveFieldPlan,
} from '../packages/core/src/browser-assist.mjs';
import {
  attachApplicationArtifact,
  startApplicationRun,
} from '../packages/core/src/application-runs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoWorkspace = path.resolve(__dirname, '..', 'demo', 'workspace');

function tempWorkspace(prefix) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const workspace = path.join(tempRoot, 'workspace');
  fs.cpSync(demoWorkspace, workspace, { recursive: true });
  return workspace;
}

test('browser assist exposes capability metadata for the local machine', () => {
  const status = browserAssistStatus();

  assert.equal(typeof status.available, 'boolean');
  assert.equal(typeof status.dependency_installed, 'boolean');
  assert.equal(typeof status.summary, 'string');
  assert.ok(Array.isArray(status.supported_portals));
  assert.ok(status.supported_portals.some(portal => portal.id === 'greenhouse'));
  assert.ok(status.supported_portals.some(portal => portal.id === 'workday'));
});

test('browser assist field planning distinguishes safe fills, manual answers, and uploads', () => {
  const workspace = tempWorkspace('job-hunter-os-browser-assist-');
  const started = startApplicationRun({
    workspaceArg: workspace,
    opportunityId: 'demo-101',
  });

  const resumePath = path.join(path.dirname(workspace), 'resume.pdf');
  fs.writeFileSync(resumePath, 'resume-bytes');

  const run = attachApplicationArtifact({
    workspaceArg: workspace,
    runId: started.run.id,
    artifactKind: 'resume',
    inputPath: resumePath,
    filename: 'resume.pdf',
  }).run;

  const safePlan = resolveFieldPlan(run, {
    label: 'Email',
    name: 'email',
    id: '',
    type: 'email',
  });
  const manualPlan = resolveFieldPlan(run, {
    label: 'Work authorization',
    name: 'work_authorization',
    id: '',
    type: 'text',
  });
  const uploadPlan = resolveFieldPlan(run, {
    label: 'Resume upload',
    name: 'resume',
    id: '',
    type: 'file',
  });
  const websitePlan = resolveFieldPlan(run, {
    label: 'Website',
    name: 'website',
    id: '',
    type: 'url',
  });
  const githubPlan = resolveFieldPlan(run, {
    label: 'Github profile*',
    name: 'github',
    id: '',
    type: 'url',
  });
  const cityPlan = resolveFieldPlan(run, {
    label: 'Location (City)*',
    name: 'city',
    id: '',
    type: 'text',
  });
  const countryPlan = resolveFieldPlan(run, {
    label: 'Country*',
    name: 'country',
    id: '',
    type: 'text',
  });
  const referralPlan = resolveFieldPlan(run, {
    label: 'How did you initially hear about this job?*',
    name: 'job_source',
    id: '',
    type: 'text',
  });
  const legalRightToWorkPlan = resolveFieldPlan(run, {
    label: 'Do you have a legal right to work in Canada if hired by Greenhouse?*',
    name: 'right_to_work',
    id: '',
    type: 'text',
  });

  assert.equal(safePlan.kind, 'safe');
  assert.equal(safePlan.key, 'email');
  assert.equal(manualPlan.kind, 'manual');
  assert.equal(uploadPlan.kind, 'upload');
  assert.equal(uploadPlan.artifact, 'resume');
  assert.equal(websitePlan.kind, 'safe');
  assert.equal(websitePlan.key, 'portfolio_url');
  assert.equal(githubPlan.kind, 'safe');
  assert.equal(githubPlan.key, 'github_url');
  assert.equal(cityPlan.kind, 'safe');
  assert.equal(cityPlan.key, 'current_city');
  assert.equal(countryPlan.kind, 'safe');
  assert.equal(countryPlan.key, 'current_country');
  assert.equal(referralPlan.kind, 'safe');
  assert.equal(referralPlan.key, 'referral_source');
  assert.equal(legalRightToWorkPlan.kind, 'manual');
  assert.equal(legalRightToWorkPlan.key, 'work_authorization');
});

test('browser assist detects workday portals and uses portal-aware upload heuristics', () => {
  const workspace = tempWorkspace('job-hunter-os-browser-assist-');
  const started = startApplicationRun({
    workspaceArg: workspace,
    opportunityId: 'demo-101',
    payload: {
      apply_url: 'https://example.myworkdayjobs.com/en-US/careers/job/business-operations-lead',
    },
  });

  const resumePath = path.join(path.dirname(workspace), 'resume.pdf');
  fs.writeFileSync(resumePath, 'resume-bytes');

  const run = attachApplicationArtifact({
    workspaceArg: workspace,
    runId: started.run.id,
    artifactKind: 'resume',
    inputPath: resumePath,
    filename: 'resume.pdf',
  }).run;

  const portal = detectBrowserAssistPortal(run, {
    url: run.portal.apply_url,
    title: 'Workday Careers',
    bodyText: 'Apply to this job in Workday',
  });
  const uploadPlan = resolveFieldPlan(run, {
    label: 'Upload files',
    name: 'attachments',
    id: 'resumeUpload',
    type: 'file',
  }, portal);

  assert.equal(portal.id, 'workday');
  assert.equal(portal.maxAutomationSteps, 4);
  assert.equal(uploadPlan.kind, 'upload');
  assert.equal(uploadPlan.artifact, 'resume');
});

test('browser assist avoids blind upload fallback on ambiguous ashby file inputs', () => {
  const workspace = tempWorkspace('job-hunter-os-browser-assist-');
  const started = startApplicationRun({
    workspaceArg: workspace,
    opportunityId: 'demo-101',
    payload: {
      apply_url: 'https://jobs.ashbyhq.com/openai/8c5c9ac9-6e56-4f91-a49b-f980fb028331/application',
    },
  });

  const resumePath = path.join(path.dirname(workspace), 'resume.pdf');
  const coverPath = path.join(path.dirname(workspace), 'cover-letter.pdf');
  fs.writeFileSync(resumePath, 'resume-bytes');
  fs.writeFileSync(coverPath, 'cover-letter-bytes');

  let run = attachApplicationArtifact({
    workspaceArg: workspace,
    runId: started.run.id,
    artifactKind: 'resume',
    inputPath: resumePath,
    filename: 'resume.pdf',
  }).run;

  run = attachApplicationArtifact({
    workspaceArg: workspace,
    runId: started.run.id,
    artifactKind: 'cover_letter',
    inputPath: coverPath,
    filename: 'cover-letter.pdf',
  }).run;

  const ambiguousPlan = resolveFieldPlan(run, {
    label: '',
    name: '',
    id: '',
    type: 'file',
  }, 'ashby');
  const resumePlan = resolveFieldPlan(run, {
    label: 'Resume',
    name: '_systemfield_resume',
    id: '',
    type: 'file',
  }, 'ashby');
  const coverPlan = resolveFieldPlan(run, {
    label: 'Cover Letter',
    name: '_systemfield_cover_letter',
    id: '',
    type: 'file',
  }, 'ashby', new Set(['resume']));

  assert.equal(ambiguousPlan.kind, 'unknown');
  assert.equal(resumePlan.kind, 'upload');
  assert.equal(resumePlan.artifact, 'resume');
  assert.equal(coverPlan.kind, 'upload');
  assert.equal(coverPlan.artifact, 'cover_letter');
});

test('browser assist keeps opening apply flow for workday chooser screens but stops at account gates', () => {
  const workdayChooser = {
    buttonTexts: ['Apply', 'Autofill with Resume', 'Apply Manually', 'Use My Last Application'],
    fields: [],
    bodyText: 'Student Employment Search for Jobs Swilley Library Public Services Student Assistant Apply Autofill with Resume Apply Manually Use My Last Application',
  };
  const workdayGate = {
    buttonTexts: ['Create Account', 'Sign In'],
    fields: [
      { label: 'Email Address*', type: 'text' },
      { label: 'Password*', type: 'password' },
    ],
    bodyText: 'Create Account If you have never applied please create a Candidate Home Account Password Requirements Sign In',
  };

  assert.equal(needsOpenApplyStep(workdayChooser, 'workday'), true);
  assert.equal(needsOpenApplyStep(workdayGate, 'workday'), false);
});
