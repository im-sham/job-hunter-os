# Sourcing

This folder stores the local job-sourcing queue.

- `candidates.yml` is the canonical machine-readable queue that the dashboard reads.
- `reviews/*.md` stores human-readable sourcing notes from assistant or import runs.

Safe default:

- keep live sourcing discoveries here first
- approve strong roles into `data/pipeline/opportunities.yml`
- leave sensitive or risky actions human-reviewed
