import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  approveSourcedCandidate,
  dismissSourcedCandidate,
  sourceOpportunities,
} from '../packages/core/src/opportunity-sourcing.mjs';
import { saveSearchStrategy } from '../packages/core/src/workspace-editor.mjs';
import { workspaceSnapshot } from '../packages/core/src/workspace.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templateWorkspace = path.resolve(__dirname, '..', 'templates', 'workspace');

function createWorkspaceCopy(prefix) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const workspace = path.join(tempRoot, 'workspace');
  fs.cpSync(templateWorkspace, workspace, { recursive: true });
  return workspace;
}

function seedStrategy(workspace) {
  saveSearchStrategy({
    workspaceArg: workspace,
    payload: {
      lanes: ['Applied AI operations', 'Fintech operations'],
      geography: {
        preferred: ['New York', 'Remote US'],
        acceptable: ['Boston'],
        blocked: ['London'],
      },
      work_mode_preferences: ['remote', 'hybrid'],
      compensation: {
        target_base_usd: 210000,
        exception_floor_usd: 165000,
      },
      step_down_logic: ['Expand geography before lowering the compensation floor.'],
    },
  });
}

test('sourcing import parses JSON-LD job postings into the review queue', () => {
  const workspace = createWorkspaceCopy('job-hunter-os-source-html-');
  seedStrategy(workspace);

  const html = `
    <html>
      <head>
        <title>Example Jobs</title>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "JobPosting",
                "title": "Business Operations Lead",
                "description": "<p>Drive strategic planning and operating cadence.</p>",
                "datePosted": "2026-04-15",
                "employmentType": "FULL_TIME",
                "url": "https://jobs.example.com/company/business-operations-lead",
                "hiringOrganization": { "name": "Example Labs" },
                "jobLocation": {
                  "@type": "Place",
                  "address": {
                    "@type": "PostalAddress",
                    "addressLocality": "New York",
                    "addressRegion": "NY",
                    "addressCountry": "US"
                  }
                }
              },
              {
                "@type": "JobPosting",
                "title": "Revenue Operations Director",
                "description": "<p>Own planning, forecasting, and systems.</p>",
                "url": "https://jobs.example.com/company/revenue-operations-director",
                "hiringOrganization": { "name": "Ledger Works" },
                "jobLocationType": "TELECOMMUTE"
              }
            ]
          }
        </script>
      </head>
      <body></body>
    </html>
  `;

  const result = sourceOpportunities({
    workspaceArg: workspace,
    payload: {
      text: html,
      source_label: 'html-import',
      source_url: 'https://jobs.example.com/company',
    },
  });

  const snapshot = workspaceSnapshot(workspace);

  assert.equal(result.added_candidate_count, 2);
  assert.equal(snapshot.sourcing.total_candidates, 2);
  assert.equal(snapshot.sourcing.pending_count, 2);
  assert.equal(snapshot.sourcing.pending_candidates[0].company.length > 0, true);
});

test('sourcing import parses embedded app-state job JSON into the review queue', () => {
  const workspace = createWorkspaceCopy('job-hunter-os-source-embedded-json-');
  seedStrategy(workspace);

  const html = `
    <html>
      <body>
        <script>
          window.__NEXT_DATA__ = {
            "props": {
              "pageProps": {
                "jobs": [
                  {
                    "title": "Strategic Operations Lead",
                    "companyName": "Northwind Health",
                    "location": "Remote US",
                    "absoluteUrl": "https://jobs.ashbyhq.com/northwind-health/strategic-operations-lead",
                    "description": "Lead operating cadence and strategic planning.",
                    "employmentType": "Full time",
                    "compensationRange": {
                      "min": 190000,
                      "max": 230000,
                      "currencyCode": "USD"
                    }
                  }
                ]
              }
            }
          };
        </script>
      </body>
    </html>
  `;

  const result = sourceOpportunities({
    workspaceArg: workspace,
    payload: {
      text: html,
      source_label: 'embedded-json-import',
      source_url: 'https://jobs.ashbyhq.com/northwind-health',
    },
  });

  const snapshot = workspaceSnapshot(workspace);

  assert.equal(result.added_candidate_count, 1);
  assert.equal(snapshot.sourcing.pending_count, 1);
  assert.equal(snapshot.sourcing.pending_candidates[0].company, 'Northwind Health');
  assert.match(snapshot.sourcing.pending_candidates[0].compensation, /\$190,000 - \$230,000/i);
});

test('sourcing import parses markdown tables from assistant output', () => {
  const workspace = createWorkspaceCopy('job-hunter-os-source-markdown-table-');
  seedStrategy(workspace);

  const markdown = `
| Company | Role | Location | Compensation | Apply URL | Source |
| --- | --- | --- | --- | --- | --- |
| Orbit Harbor | Strategic Operations Lead | Remote US | $190K - $220K | https://jobs.lever.co/orbit-harbor/strategic-operations-lead | Lever |
| Finch Systems | Business Operations Lead | New York, NY | $205K - $240K | https://jobs.ashbyhq.com/finch-systems/business-operations-lead | Ashby |
`;

  const result = sourceOpportunities({
    workspaceArg: workspace,
    payload: {
      text: markdown,
      source_label: 'assistant-table-import',
    },
  });

  const snapshot = workspaceSnapshot(workspace);

  assert.equal(result.added_candidate_count, 2);
  assert.equal(snapshot.sourcing.pending_count, 2);
  assert.equal(snapshot.sourcing.pending_candidates.some(candidate => candidate.company === 'Orbit Harbor'), true);
  assert.equal(snapshot.sourcing.pending_candidates.some(candidate => candidate.company === 'Finch Systems'), true);
});

test('sourcing ranking uses compensation and logistics fit to surface stronger roles first', () => {
  const workspace = createWorkspaceCopy('job-hunter-os-source-ranking-');
  seedStrategy(workspace);

  sourceOpportunities({
    workspaceArg: workspace,
    payload: {
      text: `
candidates:
  - company: Strong Match Co
    role: Business Operations Lead
    source_url: https://boards.greenhouse.io/strong-match/jobs/101
    location: New York, NY
    compensation: "$215K - $235K"
    summary: Own operating cadence and strategic planning.
  - company: Weak Match Co
    role: Business Operations Lead
    source_url: https://boards.greenhouse.io/weak-match/jobs/102
    location: London, UK
    compensation: "$120K - $140K"
    summary: Broad operations role.
`,
      source_label: 'ranking-import',
    },
  });

  const snapshot = workspaceSnapshot(workspace);
  const [first, second] = snapshot.sourcing.pending_candidates;

  assert.equal(first.company, 'Strong Match Co');
  assert.equal(second.company, 'Weak Match Co');
  assert.ok(Number(first.priority_score_hint) > Number(second.priority_score_hint));
  assert.equal(second.review_band, 'pass');
});

test('approving a sourced candidate creates a pipeline opportunity and marks the queue item approved', () => {
  const workspace = createWorkspaceCopy('job-hunter-os-source-approve-');
  seedStrategy(workspace);

  sourceOpportunities({
    workspaceArg: workspace,
    payload: {
      text: `
candidates:
  - company: Finch Systems
    role: Business Operations Lead
    source_site: Ashby
    source_url: https://jobs.example.com/finch/business-operations-lead
    location: New York, NY
    summary: Strong operations fit
`,
      source_label: 'yaml-import',
    },
  });

  const before = workspaceSnapshot(workspace);
  const candidateId = before.sourcing.pending_candidates[0].id;
  const result = approveSourcedCandidate({
    workspaceArg: workspace,
    candidateId,
  });
  const after = workspaceSnapshot(workspace);

  assert.equal(result.total_pipeline, 1);
  assert.equal(after.pipeline.total, 1);
  assert.equal(after.pipeline.opportunities[0].company, 'Finch Systems');
  assert.equal(after.sourcing.approved_count, 1);
  assert.equal(after.sourcing.pending_count, 0);
});

test('dismissing a sourced candidate removes it from the pending review queue', () => {
  const workspace = createWorkspaceCopy('job-hunter-os-source-dismiss-');
  seedStrategy(workspace);

  sourceOpportunities({
    workspaceArg: workspace,
    payload: {
      text: `
- [Support Systems Administrator](https://jobs.example.com/orbit/support-admin) - Orbit Harbor - San Francisco, CA
`,
      source_label: 'markdown-import',
    },
  });

  const before = workspaceSnapshot(workspace);
  const candidateId = before.sourcing.pending_candidates[0].id;
  dismissSourcedCandidate({
    workspaceArg: workspace,
    candidateId,
    reason: 'Below the strongest current target lanes.',
  });
  const after = workspaceSnapshot(workspace);

  assert.equal(after.sourcing.dismissed_count, 1);
  assert.equal(after.sourcing.pending_count, 0);
});
