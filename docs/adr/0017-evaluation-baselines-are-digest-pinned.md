# ADR 0017: Evaluation Baselines Are Digest-Pinned

- Status: Accepted

## Context

A fresh temporary directory is not enough to prove trial isolation. If the
source baseline drifts, contains a symbolic link, or changes while being copied,
different trials can silently evaluate different inputs under one dataset ID.
An unrestricted cleanup callback can also delete a path it did not create.

## Decision

The private runner provides a verified workspace provider. Every registered
baseline has a canonical workspace SHA-256 digest. Before each trial, the
provider snapshots the source under explicit file, per-file byte, aggregate
byte, and depth limits and checks the pinned digest. It then copies into a new
directory below one configured temporary root and verifies the copied digest.

Workspace snapshots reject symbolic links and special files. The provider
tracks every live path it creates, checks containment before deletion, and
refuses unknown or repeated disposal.

## Consequences

- Baseline drift fails before mutation or command execution.
- Copy races and hidden symlink content cannot produce accepted evidence.
- Cleanup authority is restricted to provider-owned temporary directories.
- Dataset maintainers must intentionally update pinned digests when reviewed
  baseline content changes.
- This protects filesystem identity but does not provide OS process, network,
  credential, or resource isolation.
