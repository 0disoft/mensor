# ADR 0023: Descriptor v2 binds sandbox evidence without upgrading trust

## Status

Accepted.

## Context

Execution descriptor v1 fingerprints a local command and explicitly records no
sandbox enforcement. Docker plans, runtime observations, and port-conformance
reports now have separate canonical artifacts, but they are not one comparison
cohort until a descriptor commits to all of them.

## Decision

Execution descriptor v2 records SHA-256 commitments to the canonical Docker
plan, runtime attestation, and port-conformance report. It also records the
sandbox adapter and collector artifact identities, observed engine and image,
and all execution limits. Creation requires a conformant report and exact
adapter, collector, plan, attestation, image, engine, and limit agreement.

The descriptor declares `evidenceLevel: port-conformance-only`. Parsing proves
only schema and canonical ordering. Consumers making evidence claims must call
the binding validator with the referenced artifacts so their digests and
cross-artifact identities are recomputed.

## Consequences

- Sandbox evidence drift starts a new execution fingerprint.
- A forged but well-shaped digest fails binding validation when artifacts are
  supplied.
- Descriptor v2 does not change public repair-rate eligibility and is not yet
  accepted by the v1 trial-evidence envelope or cohort merger.
