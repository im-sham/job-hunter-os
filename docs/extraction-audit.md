# OSS Extraction Audit

## Audit Summary

The private implementation currently has a clean conceptual seam:

- `career-ops/` is the closest thing to the reusable product core.
- `USMI/scripts/serve_dashboard.py` and `USMI/scripts/mission-control-v2.html` are an adapter layer that exposes `career-ops` inside the broader Mission Control environment.
- The private reference system also contains deeply personal operating assets that should never be part of the OSS repo.

The OSS build should therefore be an extraction and generalization effort, not a refactor-in-place.

## What Should Become OSS Core

These concepts map well to a public core engine:

- application state machine and transition rules
- search strategy scoring model and queueing logic
- opportunity evaluation logic
- packaging model for opportunity artifacts
- feedback event model and human-reviewed calibration loop
- safe-answer and human-gated submission profile model
- submission-readiness workflow logic
- onboarding orchestration and draft-generation contracts
- local workspace structure for candidate data and generated artifacts

Private reference files that informed this split:

- `career-ops/templates/states.yml`
- `career-ops/scripts/lib/state-utils.mjs`
- `career-ops/scripts/lib/report-utils.mjs`
- `career-ops/scripts/lib/scanner-utils.mjs`
- `career-ops/scripts/lib/feedback-utils.mjs`
- `career-ops/scripts/lib/submission-utils.mjs`
- `career-ops/scripts/generate-research-intake.mjs`
- `career-ops/scripts/generate-submission-queue.mjs`

## What Should Become The Standalone Dashboard/App

The public app should be a lightweight local shell over the core engine:

- onboarding flow UI for Career Base, Voice Calibration, Search Strategy, Application Profile, and Feedback Calibration
- workspace health and setup progress
- pipeline board and opportunity detail views
- evaluation and draft-generation triggers
- human-gated submission preparation surface
- local artifact browser for source-of-truth documents, generated materials, and feedback logs
- clear agent-handoff or agent-setup surface for local and chat-only assistants

This should live separately from Mission Control rather than inheriting the USMI control-center shell.

## What Should Remain Private-Only

These items should not move into OSS:

- `/Users/shamimrehman/Projects/jobhunter/MASTER_EXPERIENCE.md`
- `career-ops/config/profile.yml`
- real application folders under `career-ops/applications/`
- real reports, reviews, output PDFs, resumes, cover letters, and feedback logs
- `USMI/scripts/serve_dashboard.py` as the live operational adapter
- the broader USMI command center, relay, Slack hooks, and operator workflow
- any personal writing samples, recruiter responses, or outcome history

## Public/Private Boundary

The clean boundary is:

- OSS repo owns generalized engine logic, starter templates, demo assets, and a standalone local dashboard.
- Private repo remains the live reference implementation and source of truth for personal data, real-world outcomes, and USMI-specific integrations.

Licensing implication:

- the value-bearing parts of onboarding, scoring, evaluation, submission prep, and dashboard behavior should live in the OSS repo itself if AGPL is meant to matter in practice
- private wrappers should not become the only place where the real workflow exists

## Target OSS Repo Structure

```text
job-hunter-os/
├── apps/
│   └── dashboard/
├── demo/
│   └── workspace/
├── docs/
├── packages/
│   └── core/
├── templates/
│   └── workspace/
└── tests/
```

### Directory Roles

- `packages/core/`: data contracts, onboarding logic, state machine helpers, scoring helpers, submission workflow logic, workspace loader, CLI
- `apps/dashboard/`: local dashboard server and static UI
- `templates/workspace/`: starter files for a brand-new user
- `demo/workspace/`: sanitized example workspace
- `docs/`: extraction and product planning
- `tests/`: core smoke tests for scoring, onboarding progress, and workspace loading

Future optional additions:

- `packages/integrations/`: opt-in adapters for browser automation, job boards, or external services that are useful but not the product core

## AGPL Alignment

Because the public repo is now targeting `AGPL-3.0-only`, the architecture should preserve these rules:

- the standalone dashboard stays inside the AGPL-covered repo
- onboarding flows stay inside the AGPL-covered repo
- scoring and evaluation stay inside the AGPL-covered repo
- submission workflow logic stays inside the AGPL-covered repo
- optional integrations can be modular, but they should not become the hidden location of the real product value

See [Licensing Strategy](licensing-strategy.md) for the detailed licensing plan and friction review.

## First Public Milestone

The first OSS milestone should include:

- generalized workspace data model
- starter configs and templates
- demo workspace
- local summary CLI
- lightweight dashboard

It should explicitly defer:

- private integrations
- live portal automation
- personalized resume generation logic tied to private source docs
- Mission Control coupling
