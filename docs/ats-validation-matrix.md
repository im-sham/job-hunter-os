# ATS Validation Matrix

Last updated: April 17, 2026

## Purpose

This matrix tracks how `Job Hunter OS` browser assist behaves across the major ATS platforms we currently target. It separates:

- live smoke checks against public pages
- fixture-backed regression coverage in the test suite
- known gaps that still need broader validation

## Current Snapshot

| Portal | Live validation | Fixture coverage | Current confidence | Notes |
| --- | --- | --- | --- | --- |
| Greenhouse | Yes | Yes | Medium-high | Live browser-assist run reached final review and held sensitive fields for manual confirmation. |
| Ashby | Yes | Yes | Medium-high | Live browser-assist run attached resume and cover letter correctly after upload fixes. |
| Lever | Yes | Yes | Medium | Public apply page inspected live on April 17, 2026. Current heuristics now cover `Resume/CV`, `Current location`, referral source, authorization, and EEO patterns. |
| SmartRecruiters | Partial | Yes | Medium | Public landing page and one-click shell inspected live on April 17, 2026. Browser-assist scanning now reads accessible iframe content, but more live form variants should still be tested. |
| Workable | Yes | Yes | Medium | Public tabbed job page and live application form inspected on April 17, 2026. Browser assist now accounts for cookie-banner acceptance, the `Application` tab/apply step, and separate `Photo` vs `Resume` uploads. |
| Workday | Yes | Yes | Medium | Live validation confirmed chooser handling and safe stop at account/login gates. More in-form multi-step validation is still needed. |

## Live Pages Used In This Phase

- Greenhouse: `https://job-boards.greenhouse.io/greenhouse/jobs/7704699?gh_jid=7704699`
- Ashby: `https://jobs.ashbyhq.com/openai/8c5c9ac9-6e56-4f91-a49b-f980fb028331/application`
- Lever: `https://jobs.lever.co/bonedry/332cc6ee-c299-4a91-b8b7-e535b802c707`
- SmartRecruiters: `https://jobs.smartrecruiters.com/BringleExcellence/105472833-graphic-design-internship`
- Workable: `https://apply.workable.com/swot-hospitality-management-company/j/129F8CC85A/`
- Workday: `https://merceruniversity.wd1.myworkdayjobs.com/en-US/student/job/Swilley-Library-Public-Services-Student-Assistant_JR103569-1`

## Regression Fixtures Added

- `tests/fixtures/browser-assist/lever-apply-scan.json`
- `tests/fixtures/browser-assist/smartrecruiters-shell-scan.json`
- `tests/fixtures/browser-assist/smartrecruiters-oneclick-scan.json`
- `tests/fixtures/browser-assist/workable-job-tab-scan.json`
- `tests/fixtures/browser-assist/workable-apply-scan.json`

These fixtures intentionally capture representative portal shapes:

- pre-apply landing pages
- one-click or embedded application shells
- real upload field labels
- manual-review and EEO patterns
- common required-field variants

## Important Remaining Gaps

- SmartRecruiters still needs broader live validation across more than one company shell.
- Workday still needs more post-login multi-step validation once the form is actually reachable.
- Lever, SmartRecruiters, and Workable still need more portal-specific edge-case coverage for custom company questions and nonstandard upload labels.

## Next Reliability Goals

1. Expand SmartRecruiters live validation beyond a single company shell.
2. Capture more real-world selector variants for post-login Workday flows.
3. Add a second live Workable validation target with custom company questions or a cover-letter requirement.
4. Keep adding fixture snapshots whenever a tester hits a real portal edge case so regressions become harder to reintroduce.
