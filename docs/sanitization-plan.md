# Sanitization Plan

## Goal

Extract reusable concepts and selected code patterns from the private system without carrying over private data, private integrations, or Sham-specific operating assumptions.

## What To Sanitize

- names, emails, phone numbers, links, and locations
- master experience data and resume source material
- cover letters and writing samples
- real company pipeline state and recruiter outcomes
- absolute private file paths
- Slack, relay, and Mission Control hooks

## Extraction Method

### 1. Inventory Reusable Units

Tag private-system assets as:

- `extract-now`: generalized logic with no private payloads
- `rewrite-public`: useful behavior coupled to private paths or data
- `private-only`: personal data, operational secrets, or USMI-specific surfaces

### 2. Replace Personal Data With Demo Assets

For every public example:

- replace the candidate with a fictitious demo user
- replace company names with either obvious demo companies or public companies used only as inert examples
- replace artifacts with short sample documents that demonstrate structure, not private history

### 3. Convert Hard-Coded Assumptions Into Templates

Examples:

- `profile.yml` becomes starter files such as `career-base.yml`, `voice-profile.yml`, `search-strategy.yml`, and `application-profile.yml`
- owner labels like `sham`, `cowork`, and `code` become public roles like `human` and `assistant`
- personal search constraints become editable strategy config

### 4. Strip Private Integrations

Do not carry over:

- Slack webhooks
- relay inbox/task plumbing
- USMI dashboard endpoints
- private launcher scripts

Expose clean local extension seams instead.

### 5. Add Demo Coverage

Every extracted public feature should run against:

- starter templates
- sanitized demo workspace
- a small test suite

## Demo Asset Replacement Matrix

| Private Asset Type | OSS Replacement |
|---|---|
| master experience document | demo experience inventory + demo master experience |
| approved cover letters | sample writing pieces for voice calibration |
| real application profile | starter application profile template |
| real feedback log | demo feedback event log |
| live tracker rows | demo opportunities YAML |

## Release Checklist

- no private names or contact details
- no private company application history
- no live output PDFs or resumes
- no USMI-only operational paths
- demo workspace runs end to end
- docs explain local-first and human-in-the-loop posture

