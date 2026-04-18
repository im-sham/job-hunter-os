# Alpha Tester Guide

This guide is for someone trying `Job Hunter OS` for the first time.

## Best Install Path

For most non-technical testers, use the packaged macOS desktop app.

### Option 1: Desktop App

1. Open the `.dmg`.
2. Drag `Job Hunter OS.app` into `Applications`.
3. Open `Job Hunter OS.app`.
4. If macOS blocks the first launch, right-click the app and choose `Open`.
5. The app will create a local workspace in `~/Documents/Job Hunter OS Workspace`.

### Option 2: Tester Bundle

Use this only if you were given the bundle directly.

1. Double-click `start.command`.
2. Wait for dependencies to install the first time.
3. Let the dashboard open automatically in your browser.

This path still requires `Node.js` on the machine.

### Option 3: Run From Source

This is mainly for developers.

```bash
npm install
npm run dashboard
```

## Goal

The goal of this alpha is to see whether someone can move from raw materials to a near-submission application flow without editing YAML files or inventing their own process.

## Suggested First Run

1. Choose your assistant.
2. Import one or more resumes, LinkedIn exports, or bio documents.
3. Import two or more writing samples.
4. Click `Build Everything`.
5. Fill in `Choose Your Job Targets`.
6. Fill in `Save Reusable Application Details`.
7. Click `Run Search With My Assistant`.
8. Refresh and review the roles that come back.
9. Approve at least one role into the pipeline.
10. Generate assistant help for that role.
11. Click `Prepare Assistant Package`.
12. Use the package to continue in your assistant, or switch to browser assist in the apply flow.
13. Confirm the app stops clearly for sensitive answers and final submit.

## Recommended Assistant Paths

- `ChatGPT Desktop` or `Claude Desktop Chat`
  Use the prepared upload bundle. The app should show the exact files to upload, the exact message to paste, and a recovery message if the assistant drifts.
- `Codex` or `Claude Code`
  Use the connected workspace path.

The product should recommend the path automatically after the assistant is chosen.

## What Good Looks Like

- You can move through the product without touching config files directly.
- The app gives one obvious next step instead of forcing you to choose from several equal-weight options.
- The assistant handoff is clear enough that you do not have to invent your own prompt.
- The sourcing review loop feels understandable.
- The application flow makes it obvious what can be reused safely and what still needs human review.
- The final submit boundary feels explicit and trustworthy.

## What To Watch For

- confusing wording
- places where the product feels too dense
- unclear install steps
- unclear assistant setup or handoff steps
- confusion about safe answers versus human-gated answers
- uncertainty about when to use browser assist versus assistant fill help
- uncertainty about when to click `Ready For Final Review` versus `Mark Submitted`
- places where the app still feels too technical

## Please Report

If something feels confusing, include:

- what you were trying to do
- what you expected to happen
- what actually happened
- the assistant you were using
- whether you were in the desktop app, tester bundle, or source version
