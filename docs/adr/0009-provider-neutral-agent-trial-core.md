# ADR-0009: Keep the Agent Trial Core Provider-Neutral

- Status: Accepted
- Date: 2026-07-11

## Context

Repair evaluation needs repeated agent trials, but embedding one vendor SDK or
shell command in the fixture kit would mix credentials, network policy,
provider output, and process control with deterministic outcome scoring.

## Decision

The private fixture kit owns only the trial state machine and deterministic
oracles. A callback adapter owns the repair attempt. The core never spawns a
provider process, performs network access, or serializes raw prompts,
transcripts, source text, or exception messages.

Trial success requires a clean compiler result, unchanged protected contracts,
and a passing semantic oracle. Repeated reports expose both any-trial and
all-trials success instead of collapsing variability into one optimistic rate.

## Consequences

- Fake adapters can prove scoring and privacy behavior without credentials.
- A future provider runner needs a separate bounded process and secret policy.
- Real-agent quality remains unmeasured until such a runner executes controlled
  repeated trials.
