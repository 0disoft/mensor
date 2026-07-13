# ADR 0019: A Networkless Docker Plan Precedes Sandbox Execution

- Status: Accepted

## Context

Calling `docker run` is not itself an isolation guarantee. Default containers
retain network access, capabilities, writable root filesystems, and broad host
mount options. A dynamic workspace mount also changes the concrete host command
for every trial, while execution descriptor v1 fingerprints concrete command
arguments.

## Decision

The runner first owns a canonical networkless Docker plan. The plan requires an
immutable image digest, non-root user, read-only root filesystem, one writable
workspace mount, no network, no credentials, no Linux capabilities,
no-new-privileges, and bounded CPU, memory, PID, protocol I/O, and wall time.
Security fields are derived and cannot be caller-edited.

Materialization produces a shell-free Docker CLI command for one absolute
workspace. It does not execute Docker and does not create eligible repair-rate
evidence. Descriptor v2 fingerprints a publish-safe commitment to the stable
plan separately from the dynamic workspace path and binds Docker engine and
runtime-enforcement observations through their own artifacts.

## Consequences

- Unsafe Docker defaults cannot enter the planned adapter accidentally.
- Mutable tags and root containers are rejected.
- Current claim assessments remain `protocol-integrity-only`.
- Networkless plans can evaluate local or embedded models, but remote provider
  agents require a separately designed allowlisted proxy and scoped credential
  broker.
