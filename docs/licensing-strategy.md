# Licensing Strategy

## Status

Current direction:

- adopt `AGPL-3.0-only` for the public OSS codebase
- keep the private job-hunt system and USMI environment outside the OSS repo
- design the OSS repo so the most value-bearing product logic is inside the copyleft boundary

This document is a product and architecture recommendation, not formal legal advice.

## Why AGPLv3 Fits

`Job Hunter OS` is exactly the kind of project where network copyleft can matter:

- the public product is expected to have a dashboard or app layer
- over time, someone could run it as a hosted service
- the core value is not just a library, but the workflow logic sitting behind a user-facing interface

AGPLv3 is a strong fit if the goal is:

- allow open and commercial use
- allow consulting, support, and hosted offerings
- require hosted derivatives that modify the app to make the modified source available to users of that hosted service

AGPLv3 is therefore aligned with the stated intent better than MIT, Apache-2.0, or plain GPLv3.

## Repo Design To Make AGPL Effective

AGPL only protects the parts that are actually inside the covered codebase. To make it effective in practice, the OSS repo should keep these pieces in the AGPL-covered tree:

- onboarding flow logic
- scoring and evaluation engine
- submission-readiness workflow logic
- artifact packaging and draft-generation orchestration
- standalone dashboard or app layer

That means the public repo should not reduce itself to:

- a thin shell UI over a private service
- a template pack with the real workflow living elsewhere
- a wrapper that depends on a closed orchestration layer for the important behavior

Recommended boundary:

- `packages/core/`
  - workspace schema
  - onboarding state machine
  - evaluation and scoring logic
  - submission workflow logic
  - prompt-packaging and artifact contracts
- `apps/dashboard/`
  - the actual user-facing operating surface
  - onboarding actions
  - artifact review
  - human-gated approvals
  - visible source and license notice when the project is eventually hosted

Recommended split for optional or higher-friction pieces:

- `packages/integrations/` or separate optional repos later
  - job board adapters
  - browser automation helpers
  - external-service connectors
  - provider-specific agent launchers

The rule is:

- if it is core product value, keep it inside the AGPL repo
- if it is optional plumbing, account-specific integration, or operational glue, it can sit outside the core boundary

## Architectural Adjustments Recommended

To make AGPL meaningful rather than symbolic, the extraction plan should bias toward these adjustments:

- keep resume evaluation, opportunity scoring, submission prep, and onboarding orchestration in OSS code, not in private prompts or private dashboards
- keep the standalone dashboard as a first-class product surface, not a demo-only wrapper
- avoid moving the key behavior into a closed hosted backend or proprietary agent service
- treat external agents as helpers over local files, not as the real home of product logic
- when the public repo is published, add a clear `Source` link or equivalent source-offer UI in the dashboard for hosted/network use
- keep human-gated approvals in the OSS app so the public workflow remains complete even without private automation

## AGPL Friction Areas

## Dependencies

Current dependencies look workable with AGPL:

- `js-yaml`: `MIT`
- `mammoth`: `BSD-2-Clause`
- `jszip`: dual-licensed `MIT OR GPL-3.0-or-later`

Practical note:

- where a dependency is dual-licensed, document which option the project is relying on
- for `jszip`, prefer treating it as used under `MIT`

## Browser Automation

Browser automation can create extra compliance and packaging work even when license-compatible:

- bundled browser binaries may carry separate notices
- automation stacks can blur the line between core workflow and optional adapters
- hosted automation services can tempt implementers to move the valuable logic outside the AGPL app

Recommended approach:

- keep browser automation optional
- isolate it behind explicit adapter boundaries
- do not make the public product depend on a closed automation backend for its main value

## Optional Integrations

Potential friction points:

- connectors to proprietary services with restrictive terms
- credential-heavy integrations
- provider-specific agent workflows
- integrations that are useful operationally but not essential to the public product

Recommended approach:

- keep integrations optional and clearly bounded
- prefer file-based, CLI-based, or stable API contracts over tightly coupled embedded vendor logic
- separate service credentials, operator tooling, and deployment glue from the core repo

## Templates And Assets

Templates and assets need their own review even if the code is AGPL:

- demo resumes, cover letters, and writing samples must be original or fully sanitized
- do not include real job descriptions, scraped site content, or third-party proprietary assets without permission
- keep logos, brand marks, and other identity assets separate from the software license story

## Recommended File Set

Current repo-level legal files:

- `LICENSE`
  - full GNU AGPLv3 text
- `NOTICE`
  - project copyright holder
  - third-party attribution notes
  - demo asset provenance notes
  - statement that trademarks and brand assets are excluded
- `TRADEMARKS.md`
  - names, logos, and branding separated from the software license
- `CONTRIBUTING.md`
  - contributions accepted under the repo's AGPL terms

## `LICENSE` Recommendation

Alternative AGPL forms considered:

- `AGPL-3.0-only`
  - chosen for this repo because it gives fixed, explicit terms
- `AGPL-3.0-or-later`
  - better if you want automatic compatibility with a future FSF version

Current decision:

- use `AGPL-3.0-only`

## `NOTICE` Recommendation

AGPL does not require a `NOTICE` file the way Apache-style projects often do, but a `NOTICE` file is still useful here.

Use it for:

- project authorship and copyright ownership
- dependency attribution summary
- demo-data provenance
- explicit pointer to `TRADEMARKS.md`

## Attribution Guidance

Project guidance should ask downstream users to:

- preserve copyright and license notices
- mark significant modifications clearly
- keep source-offer or source-link UI intact for hosted versions
- preserve author attributions where specifically noted

## Trademark And Branding Separation

The code license should not be the only statement about branding.

Recommended policy:

- the software is AGPL-covered
- the name `Job Hunter OS`, logos, and related branding are reserved separately unless expressly permitted
- forks can use the code under AGPL, but should not imply endorsement or official affiliation
- nominative fair use can still be allowed in documentation, comparison, and compatibility statements

## What Should Stay Outside The OSS Repo

These items should remain outside the public repo for privacy, licensing, or coupling reasons:

- real personal workspaces
- resumes, cover letters, writing samples, recruiter emails, and outcome logs tied to a real person
- private USMI operational glue
- credentials, tokens, and account-specific integrations
- deployment-specific infrastructure that is not necessary for the public product

One important guardrail:

- do not move the valuable product logic outside the OSS repo under the label of "integration"

If scoring, submission workflow, onboarding orchestration, or dashboard behavior leave the repo and become private-only, AGPL loses most of its practical force.
