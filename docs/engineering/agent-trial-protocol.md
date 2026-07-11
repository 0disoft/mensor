# Agent Trial Protocol

- Status: Experimental
- Owner: Maintainer

## Boundary

The private fixture kit defines a provider-neutral trial protocol. It accepts
an adapter callback but does not spawn a shell, call a model provider, access
the network, store prompts, or retain transcripts. Fake adapters exercise the
protocol in repository tests.

A trial captures protected contract digests, applies one declared mutation,
records the initial diagnostics, invokes the adapter, reruns the compiler,
executes an application-owned semantic oracle, and compares workspace digests
before and after the repair attempt.

## Result Contract

Each serializable result contains:

- a stable trial, mutation, and baseline ID;
- initial diagnostic codes and detection status;
- adapter completion and round count;
- compiler, protected-contract, and semantic-oracle outcomes;
- root-relative changed paths with before and after SHA-256 values; and
- one failure category without raw exception or provider output.

`internal/fixture-kit/spec/agent-trial-report-v1.schema.json` defines the
machine-readable envelope. The fixture kit validates every trial's final-state
invariants, derives metrics and failure counts again, and rejects unknown,
reordered, or inconsistent report data. `serializeAgentTrialReport` emits the
validated report as two-space JSON with LF and one final newline.

Failure categories are `diagnostic-not-produced`, `agent-error`,
`contract-weakened`, `semantic-regression`, and `check-failed`. Final-state
evidence takes precedence over a friendly adapter response.

## Metrics

Reports group repeated trials by mutation and expose both `anyTrialRepaired`
and `allTrialsRepaired`. The first answers whether the adapter can ever solve a
case. The second answers whether every observed trial solved it. Neither is a
statistically meaningful product claim until real providers run multiple
controlled trials with recorded model, prompt, tool, environment, and cost
versions.

The summary also records one count for every stable failure category. These
counts are derived from trials; callers cannot supply independent aggregate
claims. Synthetic golden data verifies the byte contract but is not benchmark
history.

Current repository evidence covers fake adapters only. No real-agent repair
rate is claimed.

The separate private agent runner now supplies a bounded command adapter for
fake executable tests. It does not change the claim boundary: no real model or
provider has been measured.

Before retaining real-agent evidence, the runner binds the report to
`agent-execution-descriptor/v1` through a derived execution fingerprint. Runs
with different fingerprints are separate cohorts and must not be merged into
one repair metric. The descriptor contract is documented in
`docs/engineering/agent-execution-descriptor.md`.

Repeated evidence is aggregated through the runner-owned cohort merger rather
than by concatenating report JSON. The merger rejects execution, producer, and
trial-identity drift before recomputing any-trial, all-trials, and failure
metrics from the combined final-state records.
