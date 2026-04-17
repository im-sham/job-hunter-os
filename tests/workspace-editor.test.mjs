import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  addOpportunity,
  saveApplicationProfile,
  saveSearchStrategy,
} from '../packages/core/src/workspace-editor.mjs';
import { workspaceSnapshot } from '../packages/core/src/workspace.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templateWorkspace = path.resolve(__dirname, '..', 'templates', 'workspace');

function createWorkspaceCopy(prefix) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const workspace = path.join(tempRoot, 'workspace');
  fs.cpSync(templateWorkspace, workspace, { recursive: true });
  return workspace;
}

test('search strategy editor writes lanes, geography, and compensation for a fresh workspace', () => {
  const workspace = createWorkspaceCopy('job-hunter-os-strategy-');

  const result = saveSearchStrategy({
    workspaceArg: workspace,
    payload: {
      lanes: ['Applied AI operations', 'Fintech systems'],
      geography: {
        preferred: ['Remote US', 'New York City'],
        acceptable: ['Boston'],
        blocked: ['Relocation outside the United States'],
      },
      work_mode_preferences: ['remote', 'hybrid'],
      compensation: {
        target_base_usd: 210000,
        exception_floor_usd: 165000,
      },
      step_down_logic: ['Accept up to a 10 percent step-down for exceptional scope.'],
    },
  });

  const snapshot = workspaceSnapshot(workspace);

  assert.equal(result.lane_count, 2);
  assert.equal(snapshot.settings.search_strategy.lanes.length, 2);
  assert.equal(snapshot.settings.search_strategy.compensation.target_base_usd, 210000);
  assert.deepEqual(snapshot.settings.search_strategy.geography.preferred, ['Remote US', 'New York City']);
});

test('application profile editor saves contact info, safe answers, and human gates', () => {
  const workspace = createWorkspaceCopy('job-hunter-os-profile-');

  const result = saveApplicationProfile({
    workspaceArg: workspace,
    payload: {
      contact: {
        email: 'tester@example.com',
        phone: '555-0199',
        linkedin_url: 'https://linkedin.com/in/tester',
        portfolio_url: 'https://tester.example.com',
      },
      safe_answers: {
        relocation: 'Open to relocation for standout roles.',
        start_date: 'Available after a short notice period.',
        work_mode_preference: 'Remote or hybrid preferred.',
      },
      human_gated_fields: ['work authorization', 'compensation expectation', 'eeo'],
    },
  });

  const snapshot = workspaceSnapshot(workspace);

  assert.equal(result.safe_answer_count, 3);
  assert.equal(result.human_gate_count, 3);
  assert.equal(snapshot.settings.application_profile.contact.email, 'tester@example.com');
  assert.equal(snapshot.settings.application_profile.safe_answers.start_date, 'Available after a short notice period.');
  assert.equal(snapshot.human_gates.includes('work_authorization'), true);
});

test('opportunity editor adds a real role to the pipeline and task selector source', () => {
  const workspace = createWorkspaceCopy('job-hunter-os-opportunity-');

  saveSearchStrategy({
    workspaceArg: workspace,
    payload: {
      lanes: ['Applied AI operations'],
      geography: { preferred: [], acceptable: [], blocked: [] },
      work_mode_preferences: ['remote'],
      compensation: {
        target_base_usd: 180000,
        exception_floor_usd: 140000,
      },
      step_down_logic: [],
    },
  });

  const result = addOpportunity({
    workspaceArg: workspace,
    payload: {
      company: 'Northstar Labs',
      role: 'Operations Lead',
      phase: 'researching',
      human_gate: true,
      next_step: 'Review and decide whether to invest in a tailored package.',
      strategy: {
        lane: 'applied-ai-ops',
        company_stage: 'scale-up',
        work_mode: 'remote',
      },
      score: {
        capability_fit: 8,
        screen_odds: 6,
        upside: 8,
        compensation: 7,
        logistics: 9,
      },
    },
  });

  const snapshot = workspaceSnapshot(workspace);

  assert.equal(result.total, 1);
  assert.equal(snapshot.pipeline.total, 1);
  assert.equal(snapshot.pipeline.opportunities[0].company, 'Northstar Labs');
  assert.equal(snapshot.pipeline.opportunities[0].human_gate, true);
  assert.equal(snapshot.pipeline.opportunities[0].strategy.lane, 'applied-ai-ops');
});
