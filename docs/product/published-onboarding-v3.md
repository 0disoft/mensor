# Published Onboarding v3 Preparation

- Status: Prepared, no agent dispatched and no adoption result claimed
- Package baseline: Four public Mensor packages at 0.10.0
- Scope: One fresh response-artifact Node RSVP trial, at most one correction
- Classification: Exploratory, prompt-only restrictions are not host isolation

The [brief](../../internal/agent-runner/briefs/published-rsvp-onboarding-v3.md)
and [profile](../../internal/agent-runner/cohorts/published-onboarding-v3.json)
own the input and limits. The evaluator-owned
[oracle](../../internal/agent-runner/oracles/published-rsvp-onboarding-v3.test.mjs)
reuses the immutable RSVP v2 behavioral tests and adds current package metadata,
instance isolation, HTML response and client-error checks. Reference and
mutation controls test that oracle; they are not agent-authored applications.
This deliberately starts with static HTML, not a new JSX compatibility claim.

## Execution Boundary

`mensor_onboarding_v3_prepare` emits a read-only manifest containing input and
oracle digests. `mensor_onboarding_v3_bundle` additionally emits approved document
text. Give the agent only `documents`; retain the profile and oracle digests on
the evaluator side. Neither command invokes a model, installs packages, runs an
artifact, or writes a response or observation. The fixed v3 paths do not overlap
historical v1/v2 outputs. Raw responses remain ignored under `dist/`.

At dispatch, record the observed host model/provider, reasoning configuration,
exact baseline commit and input manifest; do not fabricate unavailable identity
or silently substitute a model. Start a fresh agent with no inherited context.
The next execution increment must configure a v3-only artifact evaluator before
running any generated code. Do not invoke `evaluate-published-onboarding.mjs`:
it targets historical v2 paths and 0.9.0 packages and has obsolete pnpm options.

Review and validate the response transport before materializing a fresh temporary
project. Install only the fixed official-registry packages with lifecycle scripts
disabled and no checkout substitutions. Run the protected oracle first, then the
installed CLI, each with the profile's limits and a minimal environment. Preserve
failure phase and diagnostic codes separately. Never overwrite an existing v3
response or observation. Recheck input digests before evaluation, and record
corrections without replacing initial evidence. Application semantics and Mensor
coverage are separate verdicts; no result exists until both have actually run.
