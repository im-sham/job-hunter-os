# Job Hunter OS

`Job Hunter OS` is a local-first desktop app for organizing a job search with AI assistance and human review.

It helps people turn resumes, writing samples, job targets, and reusable application details into a guided workflow for:

- building a clean source-of-truth career base
- calibrating a reusable writing profile
- sourcing and reviewing opportunities
- drafting application materials
- finishing applications without giving up control of sensitive answers or final submission

## Status

`Job Hunter OS` is in public alpha.

It is strong enough for guided testing and early feedback. It is not yet a broad consumer launch.

## What Makes It Different

- `Local-first`: your workspace and application materials stay on your machine
- `Human-in-the-loop`: sensitive fields and final submit stay human-controlled
- `Assistant-friendly`: works with desktop chat assistants and connected local coding assistants
- `Structured`: helps turn messy source material into reusable job-search assets instead of starting over every time

## Recommended Way To Try It

For most non-technical testers, use the packaged macOS desktop app from [GitHub Releases](https://github.com/im-sham/job-hunter-os/releases).

### macOS Desktop App

1. Download the latest `.dmg` from [GitHub Releases](https://github.com/im-sham/job-hunter-os/releases).
2. Open the installer and drag `Job Hunter OS.app` into `Applications`.
3. Open `Job Hunter OS.app`.
4. If macOS blocks the first launch, right-click the app and choose `Open`.
5. The app will create a local workspace in `~/Documents/Job Hunter OS Workspace`.

Current note: the alpha build is unsigned and not notarized yet, so the first-run trust prompt is expected for now.

### Tester Bundle

If you were given a tester bundle directly, start there instead:

1. Double-click `start.command`.
2. Wait for the first local dependency install.
3. Let the dashboard open automatically in your browser.

This path is mainly for guided testers. It still relies on `Node.js` being installed locally.

### Run From Source

If you are developing or evaluating the repo itself:

```bash
npm install
npm run dashboard
```

Then open `http://localhost:4173`.

## Typical Workflow

1. Choose the assistant you already use.
2. Import resumes, LinkedIn exports, bios, and writing samples.
3. Build your starter materials.
4. Set job targets and reusable application details.
5. Run a sourcing pass and review the resulting queue.
6. Approve the best roles into your pipeline.
7. Generate assistant help for evaluation, drafting, or submission prep.
8. Finish the application with either assistant help or local browser assist.
9. Stop for human review before sensitive answers and final submit.

## Assistant Support

The app is designed around a simple user-facing question: `Which assistant are you using?`

Current recommended paths:

- `ChatGPT Desktop` and `Claude Desktop Chat`: prepared upload bundle
- `Codex` and `Claude Code`: connected local workspace

For chat assistants, the dashboard now shows:

- the exact files to upload
- the exact message to paste
- a recovery message to use if the assistant drifts or returns the wrong shape

## Safety And Privacy

`Job Hunter OS` is intentionally conservative.

- Your workspace stays local.
- Sensitive fields such as legal, EEO, work authorization, and compensation items remain human-gated.
- Browser assist fills only high-confidence safe fields and stops before final submit.
- The product is designed to help with preparation, not to silently submit applications on your behalf.

## Current Alpha Scope

The current alpha already supports:

- onboarding from raw career materials and writing samples
- reusable career-base and voice-calibration artifacts
- job-target and reusable-application-detail setup
- assistant-guided sourcing into a review queue
- opportunity approval into a pipeline
- assistant task packaging for evaluation, drafting, and submission prep
- application-prep runs with safe answers and human checkpoints
- local browser assist for common ATS flows including Greenhouse, Ashby, Lever, Workable, SmartRecruiters, and Workday variants

## Current Limitations

- The packaged desktop app is currently macOS-only.
- The desktop alpha is unsigned and not notarized yet.
- ATS coverage is real but not comprehensive enough yet for broad production claims.
- PDF import is not supported yet; convert PDFs to `.docx` or text first.
- Chat-based assistant flows are much better than before, but still not as seamless as a deeply integrated local relay.

## Project Docs

- [Docs Guide](docs/README.md)
- [Alpha Roadmap](docs/alpha-roadmap.md)
- [Tester Guide](docs/tester-guide.md)
- [ATS Validation Matrix](docs/ats-validation-matrix.md)
- [Contributing](CONTRIBUTING.md)
- [License](LICENSE)
- [Notice](NOTICE)
- [Trademarks](TRADEMARKS.md)

Additional planning and architecture docs are available in [`docs/`](docs/) for contributors who want deeper implementation context.

## Developer Commands

```bash
npm test
npm run dashboard
npm run tester:package
npm run desktop:package
npm run desktop:handoff
```

## Maintainer

`Job Hunter OS` is maintained by Shamim Rehman under the `USMI Labs` umbrella.

## License

This repository is licensed under `AGPL-3.0-only`.
