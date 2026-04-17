# Onboarding Architecture

## Product Principle

The public product cannot assume the user already has a polished master resume corpus, calibrated writing voice, search policy, or structured application answers. Onboarding therefore needs to create those assets, not just consume them.

## Module 1: Career Base

Purpose:

- build a source-of-truth experience inventory from messy career materials

Inputs:

- multiple resumes
- LinkedIn profile text or export
- portfolio pages, bios, prior applications

Outputs:

- chronology
- bullet inventory
- metrics inventory
- title and skills map
- starter master experience document

Public data contract:

- `config/career-base.yml`
- `data/career-base/experience-inventory.yml`
- `data/career-base/master-experience.md`

## Module 2: Voice Calibration

Purpose:

- derive reusable writing preferences without overfitting to a single sample

Inputs:

- cover letters
- outreach emails
- about-page or profile prose

Outputs:

- reusable voice profile
- tone defaults
- assertiveness and formality guidance
- cover letter defaults

Public data contract:

- `config/voice-profile.yml`
- `writing/`

## Module 3: Search Strategy

Purpose:

- encode what a good opportunity looks like for this specific user

Inputs:

- lanes
- company stage mix
- geography and work mode preferences
- compensation goals
- step-down logic

Outputs:

- scoring weights
- queue thresholds
- sourcing filters
- strategic exception rules

Public data contract:

- `config/search-strategy.yml`

## Module 4: Application Profile

Purpose:

- separate reusable safe answers from sensitive fields that always require human review

Inputs:

- contact data
- public links
- relocation preference
- work authorization and sponsorship preferences
- compensation handling preferences

Outputs:

- safe answer profile
- explicit human-gated fields
- submission guardrails

Public data contract:

- `config/application-profile.yml`

## Module 5: Feedback Calibration

Purpose:

- capture decisions and outcomes without letting tiny samples rewrite strategy automatically

Inputs:

- skip, withdraw, submit, respond, interview, reject, offer events

Outputs:

- structured event log
- directional signals for human review
- evidence thresholds before tuning strategy

Public data contract:

- `data/feedback/events.yml`

## UX Flow

Recommended onboarding order:

1. Career Base
2. Voice Calibration
3. Search Strategy
4. Application Profile
5. Feedback Calibration

Each module should support:

- draft mode
- review mode
- completion criteria
- reopen and revise later

## Human-In-The-Loop Rules

- never auto-answer legal, EEO, or other sensitive submission questions
- never auto-submit without explicit human confirmation
- do not rewrite scoring rules from tiny feedback samples
- keep all data local-first by default

