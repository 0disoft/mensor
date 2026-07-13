# ADR 0021: Docker lifecycle is owned by an injected port

## Status

Accepted.

## Context

Runtime attestation needs one path that orders container creation, inspection,
execution, and cleanup. Calling those operations independently lets a caller
run before inspection, omit cleanup, or bind observations from another run.
The repository does not own Docker daemon integration or deployment runtime
infrastructure.

## Decision

The private agent runner owns a fixed `validate -> create -> inspect -> attest
-> start -> remove` workflow. Docker operations are supplied through a narrow
execution port. The runner validates the plan, collector identity, workspace,
input, handle, observation, output, and limits around that port.

The execution deadline aborts every pre-cleanup stage. Cleanup uses a separate
bounded signal and is attempted exactly once after any successful create,
including inspection mismatch, execution failure, and timeout. Cleanup failure
prevents a success result.

The port must honor abort signals and must not resolve `create` until it owns a
removable handle. The current repository provides no Docker daemon adapter, so
this orchestration is static control-plane hardening rather than executed
sandbox evidence.

## Consequences

- Attestation is returned only after successful execution and cleanup.
- Port errors and provider output are not copied into lifecycle errors.
- A non-cooperative external port can still outlive an aborted call; descriptor
  v2 remains blocked until a real adapter proves this contract.
