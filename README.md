# Job Hunter OS

`Job Hunter OS` is a new parallel extraction scaffold for an open-source, local-first career operations system. It is intentionally separate from the live private workflow in `/Users/shamimrehman/Projects/jobhunter` and `/Users/shamimrehman/Projects/USMI`.

It is being developed under the `USMI Labs` umbrella and currently maintained by Shamim Rehman.

## What This Repo Contains

- `docs/` planning artifacts for the extraction boundary, onboarding architecture, sanitization plan, and roadmap
- `packages/core/` a small reusable engine for loading a workspace, validating onboarding inputs, summarizing pipeline state, and exposing a CLI
- `apps/dashboard/` a lightweight local dashboard that visualizes onboarding progress, human-gated fields, and pipeline state
- `templates/workspace/` starter configs and data contracts for a new user
- `demo/workspace/` sanitized demo data so the repo is runnable without private materials

## First Milestone

The first milestone stays intentionally narrow:

- core CLI and data model
- starter config/templates
- demo data
- lightweight standalone dashboard

It does not attempt to port the full private pipeline, live portal automation, or private reference data.

## Quickstart

```bash
cd /Users/shamimrehman/Projects/job-hunter-os
npm install
npm run demo:build-onboarding
npm run demo:summary
npm run demo:doctor
npm run dashboard
```

Then open [http://localhost:4173](http://localhost:4173).

## Dashboard Workflow

The dashboard is now the recommended first-run surface for the OSS scaffold.

- import career materials from a local file or pasted text
- import writing samples from a local file or pasted text
- generate Career Base and Voice Calibration drafts without touching the CLI
- preview generated artifacts in the browser before handing anything to an agent
- run a job-sourcing pass with the current assistant and load the results into a local review queue
- approve sourced roles into the real application pipeline or dismiss them cleanly
- choose an assistant and let the dashboard recommend the right connection path
- package role-specific agent tasks for evaluation, resume-plus-cover-letter drafting, and submission preparation
- turn an approved role into an application-prep run with a packet, checklist, safe reusable fields, and manual-review checkpoints
- attach the final resume and optional cover letter before launching browser-fill help
- launch a local browser-assist flow that opens Chrome, uploads final files, fills only high-confidence safe fields, and stops before submit
- launch assistant-driven fill help that explicitly stops for sensitive questions and before final submit
- show one recommended next step inside the application flow instead of making the user pick between several parallel options at once
- prepare local agent handoff bundles through the `Agent Bridge`, with either workspace-reference handoffs or ready-to-upload chat bundles
- save search strategy, application profile, and fallback manual opportunities directly from the dashboard without editing YAML

The dashboard still stops short of auto-submitting anything. Sensitive fields remain human-reviewed on purpose.

## Agent Modes

`Job Hunter OS` currently supports two clear agent handoff patterns:

- `Folder-connected agent`: for tools like Codex or any assistant that can open the local repo/workspace directly
- `Chat-only agent`: for assistants where you manually upload artifacts and paste a brief

Both modes keep the same rules:

- the workspace stays local
- risky actions need human approval
- legal, EEO, work authorization, compensation, and other sensitive fields remain human-gated

## Recommended User Stories

For less-technical users, the product should not lead with transport choices like `folder_access` or `MCP`.

- `ChatGPT Desktop` or `Claude Desktop Chat`: recommend the prepared upload bundle
- `Claude Code` or `Codex`: recommend the connected workspace path
- advanced MCP-backed flows should remain optional and secondary until the product ships a dedicated connector that is simpler than manual setup

The user-facing question should be: "Which assistant are you using?" The system can then choose the right handoff story behind the scenes.

## Tester Milestone

The current product-quality milestone is aimed at external testing:

- import materials from the dashboard
- save search strategy from the dashboard
- save application profile from the dashboard
- run a sourcing pass and approve roles from the dashboard
- generate a task pack
- prepare an assistant-specific handoff bundle
- finish an application-prep run through the point of final human review
- optionally use local browser assist instead of an assistant handoff for the first pass of safe browser-fill

See [Tester Guide](docs/tester-guide.md) for the recommended external-test flow.

## Tester Packaging

The repo now includes a lightweight tester-bundle flow so you can hand someone a cleaner local package instead of a raw source checkout.

```bash
cd /Users/shamimrehman/Projects/job-hunter-os
npm install
npm run tester:package
```

That generates:

- `dist/job-hunter-os-tester/` with a fresh starter workspace
- `dist/job-hunter-os-tester.zip` for sharing
- `start.command` for a Mac-friendly launch path
- `reset-workspace.command` to restore a clean starter workspace

Inside the bundle, the tester can usually start by double-clicking `start.command`.

## Desktop App Packaging

There is now also a native macOS desktop-app path for less-technical testers.

```bash
cd /Users/shamimrehman/Projects/job-hunter-os
npm install
npm run desktop:package
npm run desktop:handoff
```

That produces:

- `dist/desktop/Job Hunter OS-0.1.0-arm64.dmg`
- `dist/desktop/mac-arm64/Job Hunter OS.app`
- `dist/desktop/Job Hunter OS-0.1.0-arm64-mac.zip`
- `dist/desktop/handoff/` with the DMG, zip fallback, checksums, and a short tester install note

The desktop app stores the local workspace in `~/Documents/Job Hunter OS Workspace` and opens the dashboard in a native application window.

Note: the current build is unsigned and not notarized, so external testers may need to right-click the app and choose `Open` on first launch.

For external alpha testers, the recommended artifact is the `.dmg`, since it gives them the familiar drag-to-Applications install flow.

## GitHub Release Packaging

The repo also includes a GitHub Actions workflow for desktop release builds.

- `workflow_dispatch` can build a desktop alpha on demand
- tags like `v0.1.0-alpha.1` can produce a GitHub release with installable macOS assets
- the release path is designed around the unsigned `.dmg` plus the `.zip` fallback

## Agent Bridge

The OSS scaffold now includes a local `Agent Bridge` layer so the dashboard can prepare a concrete handoff instead of leaving the user with a loose prompt.

- `folder_access` creates a local outbox item with prompt, manifest, and workspace references for tools like Codex or Claude Code
- `chat_upload` creates a local upload bundle with copied files plus `prompt.txt` for desktop chat assistants
- handoffs are stored inside the workspace under `data/agent-bridge/`
- this is intentionally a local bridge, not a hosted relay service

This is the first public analogue of the private relay-style flow. It packages the work cleanly now, and future slices can add richer adapters on top of the same local handoff contract.

## CLI

```bash
node packages/core/src/cli.mjs init --workspace /tmp/my-job-hunter-os
node packages/core/src/cli.mjs init --workspace /tmp/my-job-hunter-os-demo --demo
node packages/core/src/cli.mjs import-career-source --workspace /tmp/my-job-hunter-os --input /path/to/resume.docx --kind resume
node packages/core/src/cli.mjs import-career-source --workspace /tmp/my-job-hunter-os --input /path/to/linkedin-profile.txt --kind linkedin
node packages/core/src/cli.mjs import-writing-sample --workspace /tmp/my-job-hunter-os --input /path/to/cover-letter.md
node packages/core/src/cli.mjs build-career-base --workspace demo/workspace
node packages/core/src/cli.mjs build-voice-profile --workspace demo/workspace
node packages/core/src/cli.mjs build-onboarding --workspace demo/workspace
node packages/core/src/cli.mjs source-opportunities --workspace demo/workspace --input /path/to/search-results.md --source-label assistant-run
node packages/core/src/cli.mjs queue-sourcing-run --workspace demo/workspace --assistant codex --adapter folder_access
node packages/core/src/cli.mjs browser-assist-status
node packages/core/src/cli.mjs run-browser-assist --workspace demo/workspace --run run-0001
node packages/core/src/cli.mjs summary --workspace demo/workspace
node packages/core/src/cli.mjs doctor --workspace demo/workspace
node packages/core/src/cli.mjs bridge-status --workspace demo/workspace
node packages/core/src/cli.mjs queue-agent-task --workspace demo/workspace --opportunity demo-101 --task-type draft_application_package --assistant chatgpt_desktop
npm run tester:start
npm run tester:reset-workspace
npm run tester:package
npm run desktop:dev
npm run desktop:package
npm run desktop:handoff
```

## Import Notes

- Supported career-material and writing-sample formats: `.txt`, `.md`, `.html`, `.json`, `.docx`
- `.docx` import uses `mammoth` for first-pass text extraction
- `.pdf` import is not supported yet in this scaffold; convert PDFs to `.docx` or text first
- Imported source text is normalized into the workspace before any draft roles, metrics, skills, or voice artifacts are generated
- Career imports now try to extract profile summary lines, contact signals, roles, metrics, and skills from resume- and LinkedIn-style inputs
- Voice calibration now generates recommendations, watchouts, repeated phrase signals, and opener patterns in addition to raw counts

## Planning Docs

- [Extraction Audit](docs/extraction-audit.md)
- [Licensing Strategy](docs/licensing-strategy.md)
- [Sanitization Plan](docs/sanitization-plan.md)
- [Onboarding Architecture](docs/onboarding-architecture.md)
- [Roadmap](docs/roadmap.md)
- [Alpha Roadmap](docs/alpha-roadmap.md)
- [Tester Guide](docs/tester-guide.md)

## License

This repository is licensed under `AGPL-3.0-only`.

That choice is being incorporated into the architecture itself:

- value-bearing onboarding, scoring, evaluation, submission-prep, and dashboard logic should live inside this OSS repo
- private personal data, operator glue, and account-specific integrations should remain outside it

See [Licensing Strategy](docs/licensing-strategy.md) for the implementation implications, and see:

- [LICENSE](LICENSE)
- [NOTICE](NOTICE)
- [TRADEMARKS.md](TRADEMARKS.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
