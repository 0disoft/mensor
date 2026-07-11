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

Current repository evidence covers fake adapters only. No real-agent repair
rate is claimed.
