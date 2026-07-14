# ADR 0029: Real Docker gate is compatibility evidence

## Status

Accepted.

## Context

Fake execution ports and bounded subprocess tests cannot establish that the
repository-owned Docker CLI adapter matches a real daemon. A real-daemon test
can close that compatibility gap, but a CI success log is not an independently
signed runtime receipt and does not measure whether an LLM repaired a feature.

## Decision

Add one dedicated `docker-integration` gate. It builds the private runner,
explicitly preloads a digest-pinned public Alpine probe image, and invokes the
repository-owned Docker CLI port for success, timeout, output-limit, and
nonzero-exit cases.

The success case proves non-root execution, read-only root filesystem behavior,
stdin/stdout attachment, and write access to the sole workspace mount. Every
case is followed by an independent daemon query that requires zero containers
with the Mensor owner label. The gate also requires zero such containers before
starting and never removes a pre-existing container.

The image preload uses an empty temporary Docker configuration and no registry
credentials. Container creation retains `--pull=never`. The integration summary
contains only image and normalized runtime identities plus derived case
outcomes.

## Consequences

- Linux CI can reject Docker CLI or daemon behavior drift that unit fakes miss.
- The gate mutates only ephemeral container state and the runner's image cache.
- A passing gate is real-daemon compatibility evidence for that run.
- It is not independent provenance, a portable attestation, or evidence that an
  external coding agent repaired a mutation.
