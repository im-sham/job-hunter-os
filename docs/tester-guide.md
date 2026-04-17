# Tester Guide

This guide is for a first external tester using `Job Hunter OS` locally.

## Fastest Way To Start

If you receive a tester bundle from the maintainer:

1. Double-click `start.command`.
2. Wait for the first local dependency install.
3. Let the dashboard open automatically in your browser.

If you receive the desktop app package instead:

1. Open the `.dmg` desktop installer.
2. Drag `Job Hunter OS.app` into `Applications`.
3. Open `Job Hunter OS.app`.
4. If macOS blocks it, right-click and choose `Open`.
5. The app will create a local workspace in `~/Documents/Job Hunter OS Workspace`.

If you are running from source instead of a prepared bundle:

1. Run `npm install`.
2. Run `npm run tester:package` if you want the clean packaged handoff.
3. Or run `npm run dashboard` to use the demo workspace directly.

## Goal

Get from raw materials to sourced jobs and then all the way to a near-submission application run without editing YAML files directly.

## What To Test

1. Import career material and writing samples from the dashboard.
2. Save a basic search strategy in the dashboard.
3. Save an application profile with safe answers and human-gated fields.
4. Run a sourcing pass and review the roles it finds.
5. Approve at least one role into the pipeline.
6. Generate a task pack for that role.
7. Prepare a handoff for the assistant they actually use.
8. Start `Finish The Application`, attach the final resume, and launch fill help.
9. Confirm the app makes the final human-review step obvious before submit.

## Recommended Assistant Paths

- `ChatGPT Desktop` or `Claude Desktop Chat`
  Use the prepared upload bundle path.
- `Codex` or `Claude Code`
  Use the connected workspace path.

The product should recommend the path automatically after the tester chooses their assistant.

## Happy Path

1. Start the app and follow the highlighted step in `Setup Journey`.
2. Add one or more background files in `Tell Us About Your Background`.
3. Add two or more writing samples in `Teach Us How You Write`.
4. Click `Build Everything` in `Build Your Starter Materials`.
5. Fill in `Choose Your Job Targets`.
6. Fill in `Save Reusable Application Details`.
7. Click `Run Search With My Assistant` in `Find Jobs To Review`.
8. Refresh and approve at least one sourced role into the pipeline.
9. Choose that role in `Prepare An Assistant Package`.
10. Generate `Review This Job` or `Draft Application Materials`.
11. Click `Prepare Assistant Package`.
12. Open `Finish The Application`.
13. Confirm the direct apply link, then click `Start Application Prep`.
14. Attach a final resume and optional cover letter.
15. Choose either `Launch Browser Assist` or `Launch Assistant Fill Help`.
16. If using browser assist, confirm it only fills safe fields and stops before final submit.
17. After the browser or assistant reaches the stop point, click `Ready For Final Review`.
18. Only after the live application is truly submitted, click `Mark Submitted`.

## Success Criteria

- The tester can complete the flow without touching YAML files.
- The assistant recommendation feels obvious and low-friction.
- The handoff bundle is clear enough that the tester knows exactly what to do next.
- The application-prep flow makes it obvious what is safe to reuse and what still needs a human answer.
- The local browser-assist option feels trustworthy and conservative rather than reckless.
- The app recommends one obvious next move instead of making the tester choose between multiple equally weighted actions.
- The final submit boundary feels explicit and trustworthy.
- Sensitive fields still remain clearly human-gated.

## What To Watch For

- confusion about assistant choice
- confusion about the difference between `Run Search With My Assistant` and the manual import fallback
- confusion about safe answers vs human-gated fields
- unclear opportunity-scoring inputs
- unclear handoff instructions after clicking `Prepare Assistant Package` or `Launch Assistant Fill Help`
- uncertainty about when browser assist should be used versus assistant fill help
- uncertainty about when the user is supposed to click `Ready For Final Review` versus `Mark Submitted`
- places where the tester still feels forced into a technical workflow
