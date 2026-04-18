# Public Alpha Roadmap

## Current Status

`Job Hunter OS` is ready for a public alpha and design-partner testing cycle. It is not yet ready for a broad public launch with strong expectations of seamlessness across assistants, ATS portals, and first-run desktop install flows.

## What Is Already Strong

- local-first workspace and human-in-the-loop boundaries are clear
- onboarding, sourcing, pipeline, drafting, application prep, and browser assist now form a real end-to-end product story
- the desktop app makes the project feel like a real product instead of a repo-only prototype
- browser assist has real validation on Greenhouse, Ashby, and Workday-style flows
- the dashboard is materially clearer than the earlier operator-console shape

## Open Gaps

### Recovery And Guidance

- users still need clearer explanations when a flow pauses on login, missing fields, portal ambiguity, or human-gated questions
- the product should feel more like "here is exactly what to do next" and less like "interpret this system state"

### Assistant Experience

- connected assistants still have the cleanest path
- chat-only users can succeed, but the experience still has more friction than the private relay-backed system
- the product still needs better in-app coaching for less-technical assistant users

### ATS Reliability

- Greenhouse, Ashby, Workday, and now at least one live Workable flow are promising, but coverage and confidence are not broad enough yet for a stronger public promise
- more live validation is needed across Lever, SmartRecruiters, additional Workable variants, and edge-case custom forms

### Sourcing Quality

- the sourcing flow exists and works, but needs stronger parsing, dedupe, review support, and ranking quality before it feels consistently magical

### Packaging And Trust

- the macOS app is installable, but unsigned and not notarized
- first-run trust prompts still create friction for mainstream users

### Public Release Hygiene

- docs, release notes, issue templates, and tester guidance should continue improving so alpha users know exactly what the product is and is not yet

## Near-Term Roadmap

### Phase A: Alpha Launch Hardening

Goal:
Ship a credible public alpha with a real installable package, public roadmap, and clear expectations.

Deliverables:

- GitHub source push and public docs cleanup
- macOS desktop release packaging centered on a drag-to-Applications DMG
- tester install docs and alpha framing
- issue intake for tester feedback

### Phase B: Recovery UX And Guided Pauses

Goal:
Make the product easier to recover when automation or assistants hit a boundary.

Deliverables:

- clearer pause reasons in sourcing, assistant handoff, and browser assist
- stronger "recommended next step" guidance in every blocked state
- explicit human-review explanations for sensitive fields and final submission
- better empty states and troubleshooting copy

### Phase C: ATS Reliability Matrix

Goal:
Increase confidence that browser assist behaves safely and predictably across the major portals users actually hit.

Deliverables:

- live validation matrix for Greenhouse, Ashby, Lever, Workable, SmartRecruiters, and Workday
- portal-specific selector hardening and upload behavior fixes
- better required-field detection and final-review summarization
- regression fixtures captured from real-world form variants

Tracking artifact:

- see [ATS Validation Matrix](ats-validation-matrix.md)

### Phase D: Assistant Experience Polish

Goal:
Close the gap between connected assistants and chat-only assistants.

Deliverables:

- clearer assistant setup and troubleshooting from inside the app
- cleaner upload-bundle packaging for chat-only assistants
- stronger handoff instructions and fewer manual interpretation steps
- optional deeper connectors where they improve ease of use without hiding human gates

### Phase E: Sourcing Quality And Pipeline Intelligence

Goal:
Move from "usable sourcing" to "wow, this actually built me a good queue."

Deliverables:

- stronger extraction from assistant-generated search results and live pages
- better dedupe and company-role normalization
- richer scoring explanations and queue review cues
- faster approve / dismiss / revisit workflow in the jobs workspace

### Phase F: Distribution Polish

Goal:
Reduce install friction so non-technical users can trust the product more quickly.

Deliverables:

- signing and notarization plan for the macOS app
- cleaner release notes and asset labeling
- smoother first-run setup and workspace reset experience

## Beta Readiness Gates

We should feel good calling this a broader beta once these are true:

- major ATS coverage is tested and stable enough for clearer claims
- blocked-state recovery is understandable to non-technical users
- the assistant story feels coherent even for chat-only users
- the desktop release experience is trusted and easy to install
- we have real feedback from multiple alpha testers and have resolved the highest-friction themes
