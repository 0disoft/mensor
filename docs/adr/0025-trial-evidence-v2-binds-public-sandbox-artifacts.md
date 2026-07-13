# ADR 0025: Trial evidence v2 binds public sandbox artifacts

## Status

Accepted.

## Context

Execution descriptor v2 commits to a Docker plan, runtime attestation, and port
conformance report, but descriptor parsing alone cannot validate those external
artifacts. Trial-evidence v1 accepts only the local-command descriptor and has
no place to carry sandbox artifacts for independent binding validation.

Separate artifact digests are insufficient if an attestation reports limits
from one plan or a conformance report probes another base plan. A portable
envelope must reject those cross-artifact mixtures without requiring the raw
host executable path or agent arguments.

## Decision

`agent-trial-evidence/v2` embeds one sandbox execution descriptor, the
publish-safe plan commitment, runtime attestation, port-conformance report, and
canonical trial report. Its validator recomputes the execution fingerprint and
every descriptor digest, verifies collector and adapter identities, and checks
that attestation limits plus every conformance probe plan derive from the same
plan commitment.

The v2 cohort merger accepts only byte-identical execution descriptors and
sandbox artifacts with one report producer version. It rejects duplicate trial
IDs and derives merged metrics from the canonical trial records.

## Consequences

- Evidence consumers can revalidate the complete portable artifact graph
  without receiving the private Docker plan.
- Attestation-limit drift and conformance base/case-plan drift fail closed.
- Host Docker paths, raw agent arguments, workspace paths, container handles,
  and raw inspection output remain outside the envelope.
- The envelope binds supplied artifacts; it does not prove the trial report was
  produced by that sandbox. Public repair-rate eligibility stays false until an
  atomic sandbox trial runner owns execution, report creation, and envelope
  construction.
