# ADR 0018: Public Repair Rates Require Enforced Isolation

- Status: Accepted

## Context

The local command runner proves protocol validation, bounded I/O, final-state
checks, and cohort identity. It does not prove filesystem confinement, process
tree containment, network policy, or scoped credential delivery. Publishing a
repair rate from that evidence would hide material differences between trials
and invite source or credential exposure.

## Decision

Agent evidence has a separate canonical claim assessment. Execution descriptor
v1 is always classified as `protocol-integrity-only` and is never eligible for
a public repair-rate claim. Its assessment records four mandatory blockers:

- credential scope is not attested;
- filesystem isolation is not attested;
- network control is not enforced; and
- process containment is not enforced.

The assessment is derived from validated evidence. Eligibility and blockers
cannot be supplied by a caller or edited independently. A future sandboxed
runner requires a new execution descriptor revision whose enforcement evidence
can be validated rather than a flag added to descriptor v1.

## Consequences

- Local and fake-agent trials remain useful for protocol and regression tests.
- Their repaired counts cannot be presented as product or model repair rates.
- A sandbox adapter must prove all four boundaries before public metrics become
  possible.
- Existing evidence stays truthful and does not need to pretend that process
  termination is an OS sandbox.
