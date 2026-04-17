import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  workspaceDoctor,
  workspaceSnapshot,
} from '../packages/core/src/workspace.mjs';
import { recommendationForScore, scoreOpportunity } from '../packages/core/src/state-machine.mjs';
import {
  buildCareerBaseArtifacts,
  buildVoiceCalibrationArtifacts,
} from '../packages/core/src/onboarding-builders.mjs';
import {
  importCareerSource,
  importWritingSample,
} from '../packages/core/src/importers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoWorkspace = path.resolve(__dirname, '..', 'demo', 'workspace');

test('demo workspace snapshot exposes onboarding, feedback, and pipeline summaries', () => {
  const snapshot = workspaceSnapshot(demoWorkspace);

  assert.equal(snapshot.meta.candidate_name, 'Alex Morgan');
  assert.equal(snapshot.onboarding.total, 5);
  assert.equal(snapshot.onboarding.completed, 5);
  assert.equal(snapshot.pipeline.total, 4);
  assert.equal(snapshot.pipeline.human_gate_count, 1);
  assert.equal(snapshot.sourcing.total_candidates, 3);
  assert.equal(snapshot.sourcing.pending_count, 2);
  assert.equal(snapshot.feedback.event_count, 4);
  assert.equal(snapshot.applications.total_runs, 0);
  assert.equal(snapshot.guidance.current_focus, 'Pipeline Review');
  assert.ok(snapshot.documents.career_sources.length > 0);
  assert.ok(snapshot.documents.writing_samples.length > 0);
  assert.equal(snapshot.settings.search_strategy.lanes.length > 0, true);
  assert.equal(snapshot.settings.application_profile.contact.email, 'alex@example.com');
  assert.equal(snapshot.artifacts.find(artifact => artifact.key === 'voice_guide')?.exists, true);
  assert.equal(snapshot.artifacts.some(artifact => artifact.relative_path === 'data/sourcing/reviews/batch-0001.md'), true);
  assert.equal(snapshot.artifacts.some(artifact => artifact.relative_path === 'data/applications/runs.yml'), false);
});

test('doctor passes for the demo workspace', () => {
  const doctor = workspaceDoctor(demoWorkspace);

  assert.equal(doctor.ok, true);
  assert.equal(doctor.missing_files.length, 0);
});

test('priority scoring and recommendation follow configured thresholds', () => {
  const searchStrategy = {
    scoring_weights: {
      capability_fit: 35,
      screen_odds: 30,
      upside: 20,
      compensation: 10,
      logistics: 5,
    },
    thresholds: {
      pursue_now: 80,
      selective_pursue: 68,
      hold: 55,
    },
  };

  const score = scoreOpportunity({
    score: {
      capability_fit: 8,
      screen_odds: 7,
      upside: 9,
      compensation: 8,
      logistics: 7,
    },
  }, searchStrategy);

  assert.equal(score, 78.5);
  assert.equal(recommendationForScore(score, searchStrategy), 'selective_pursue');
});

test('career base and voice builders generate onboarding artifacts', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'job-hunter-os-'));
  const tempWorkspace = path.join(tempRoot, 'workspace');
  fs.cpSync(demoWorkspace, tempWorkspace, { recursive: true });

  const careerBase = buildCareerBaseArtifacts(tempWorkspace);
  const voice = buildVoiceCalibrationArtifacts(tempWorkspace);

  const generatedMasterExperience = path.join(tempWorkspace, careerBase.output);
  const generatedVoiceGuide = path.join(tempWorkspace, voice.output_guide);

  assert.equal(fs.existsSync(generatedMasterExperience), true);
  assert.equal(fs.existsSync(generatedVoiceGuide), true);
  assert.match(fs.readFileSync(generatedMasterExperience, 'utf-8'), /Alex Morgan Master Experience Draft/);
  assert.match(fs.readFileSync(generatedVoiceGuide, 'utf-8'), /Voice Guide/);
  assert.match(fs.readFileSync(generatedVoiceGuide, 'utf-8'), /Recommendations/);
  assert.match(fs.readFileSync(generatedVoiceGuide, 'utf-8'), /Opening Sentence Patterns/);
});

test('importers normalize raw career materials and writing samples into a fresh workspace', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'job-hunter-os-import-'));
  const tempWorkspace = path.join(tempRoot, 'workspace');
  const templateWorkspace = path.resolve(__dirname, '..', 'templates', 'workspace');
  fs.cpSync(templateWorkspace, tempWorkspace, { recursive: true });

  const resumePath = path.join(tempRoot, 'resume.md');
  const linkedinPath = path.join(tempRoot, 'linkedin.txt');
  const writingPath = path.join(tempRoot, 'note.md');

  fs.writeFileSync(resumePath, `Jordan Rivera
Operations and strategy leader

EXPERIENCE
Northstar Payments | Director of Operations | Jan 2022 - Present
- Reduced escalation resolution time by 35%.
- Built a weekly operating review across support and product.

Orbit Health
Senior Program Manager
Jun 2019 - Dec 2021
- Improved onboarding conversion by 17%.

SKILLS
Operations strategy, Forecasting, Customer operations
`);

  fs.writeFileSync(linkedinPath, `Jordan Rivera
Strategic operator for service-heavy teams

PROFESSIONAL EXPERIENCE
CivicFlow | Operations Manager | 2016 - 2019
- Launched a partner rollout program across public-sector accounts.
`);

  fs.writeFileSync(writingPath, `I write in a direct, concrete style.
I prefer evidence over hype and I keep sentences fairly tight.`);

  const importedResume = await importCareerSource({
    workspaceArg: tempWorkspace,
    inputPath: resumePath,
    kind: 'resume',
  });
  const importedLinkedIn = await importCareerSource({
    workspaceArg: tempWorkspace,
    inputPath: linkedinPath,
    kind: 'linkedin',
  });
  const importedWriting = await importWritingSample({
    workspaceArg: tempWorkspace,
    inputPath: writingPath,
  });

  const careerConfig = fs.readFileSync(path.join(tempWorkspace, 'config', 'career-base.yml'), 'utf-8');
  const inventory = fs.readFileSync(path.join(tempWorkspace, 'data', 'career-base', 'experience-inventory.yml'), 'utf-8');
  const voiceProfile = fs.readFileSync(path.join(tempWorkspace, 'config', 'voice-profile.yml'), 'utf-8');
  const careerBaseBuild = buildCareerBaseArtifacts(tempWorkspace);
  const generatedMasterExperience = fs.readFileSync(path.join(tempWorkspace, careerBaseBuild.output), 'utf-8');

  assert.equal(fs.existsSync(path.join(tempWorkspace, importedResume.imported_text)), true);
  assert.equal(fs.existsSync(path.join(tempWorkspace, importedLinkedIn.imported_text)), true);
  assert.equal(fs.existsSync(path.join(tempWorkspace, importedWriting.imported_text)), true);
  assert.match(careerConfig, /Jordan Rivera/);
  assert.match(careerConfig, /Operations and strategy leader/);
  assert.match(inventory, /Northstar Payments/);
  assert.match(inventory, /Orbit Health/);
  assert.match(inventory, /CivicFlow/);
  assert.match(inventory, /Strategic operator for service-heavy teams/);
  assert.match(inventory, /35%/);
  assert.match(inventory, /Forecasting/);
  assert.match(voiceProfile, /writing\/imported\//);
  assert.match(generatedMasterExperience, /Imported Summary Inputs/);
  assert.match(generatedMasterExperience, /Strategic operator for service-heavy teams/);
});
