# Contributing

Contributions to `Job Hunter OS` are welcome.

The project is currently maintained by Shamim Rehman under the `USMI Labs`
umbrella.

## License

By submitting a contribution, you represent that:

- you have the right to contribute the material
- the contribution does not knowingly include private candidate data,
  proprietary third-party content, or credentials
- you are willing for the contribution to be released under
  `AGPL-3.0-only`

There is currently no separate contributor license agreement for this
repo. Contributions are accepted under the repository's existing license
terms.

## Project Guardrails

Please keep these boundaries intact:

- do not add real personal workspaces, resumes, cover letters, recruiter
  emails, or outcome logs
- do not reintroduce coupling to the private USMI or personal job-hunt
  environment
- keep core onboarding, scoring, evaluation, submission-prep, and
  dashboard logic inside the OSS repo rather than moving it into private
  adapters

## Change Style

For product and architectural changes:

- prefer local-first workflows
- preserve human-in-the-loop handling for risky actions
- keep legal, EEO, work authorization, compensation, and other sensitive
  submission fields explicitly human-gated

For licensing and attribution changes:

- preserve copyright and license notices
- mark meaningful modifications clearly
- do not imply endorsement through `Job Hunter OS` branding
