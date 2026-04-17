# Phased Roadmap

## Phase 0: Boundary And Scaffold

Deliverables:

- public/private boundary
- repo structure
- sanitization plan
- onboarding architecture
- proposed licensing strategy
- separate OSS scaffold

Status:

- started in this repo

## Phase 1: Local Workspace Foundation

Deliverables:

- workspace templates
- demo workspace
- CLI for init, summary, and doctor
- local dashboard for onboarding and pipeline visibility

Why this phase first:

- it proves the repo shape and public data contracts without touching the live system

## Phase 2: Career Base And Voice Importers

Deliverables:

- resume import flow
- LinkedIn/profile text ingestion
- writing sample ingestion
- first-pass master experience builder
- first-pass voice profile builder

## Phase 3: Strategy And Pipeline Engine

Deliverables:

- search strategy editor
- opportunity scoring and queueing
- opportunity evaluation workflow
- state machine helpers
- artifact packaging contract
- dashboard workflow views

Architecture requirement:

- keep scoring, evaluation, and workflow logic in the AGPL-covered OSS repo rather than pushing it into private orchestration

## Phase 4: Human-Gated Submission Prep

Deliverables:

- reusable answer profile
- human-gated field handling
- application prep checklist
- submission readiness workflow
- agent handoff workflow for resume, cover-letter, evaluation, and submission-prep tasks

Architecture requirement:

- submission-prep logic and human-gated review should remain in the OSS repo so hosted derivatives cannot privatize the main workflow while exposing only a thin shell

## Phase 5: Optional Integrations

Deliverables:

- job board adapters
- research intake helpers
- external service integrations behind explicit opt-in

Architecture requirement:

- treat integrations as optional adapters, not the place where the core product behavior lives
- keep provider-specific automation and account-specific glue modular so the AGPL-covered core remains coherent on its own

## Port-Back Strategy

Useful improvements can later be ported back into the private system selectively. The OSS repo should not become the migration path for the live environment.

## Licensing Follow-Through

Before public release:

- confirm repo headers and notices are consistent with `AGPL-3.0-only`
- add dashboard-visible source and license notices for hosted use
- review dependency and demo-asset provenance before publishing

## Alpha Follow-Through

This document captures the extraction roadmap. For the current alpha hardening plan after the first public push, see [Alpha Roadmap](alpha-roadmap.md).
