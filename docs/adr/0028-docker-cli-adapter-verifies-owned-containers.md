# ADR 0028: Docker CLI adapter verifies owned containers

## Status

Accepted.

## Context

The atomic sandbox runner previously stopped at an injected execution port.
That kept lifecycle policy testable but left process invocation, Docker command
construction, container ownership, and cleanup behavior outside the repository.
A useful adapter must narrow that trust boundary without turning fake-port
conformance into a claim about a real daemon.

## Decision

Implement one private Docker CLI execution port in `internal/agent-runner`.
It accepts an absolute Docker executable path, passes only an explicit
environment, closes stdin for control commands, bounds combined output, omits
stderr from results, honors abort signals, and attempts process-tree
termination.

Container creation uses `--pull=never`, the sandbox plan's isolation and
resource limits, an unpredictable name, and owner, nonce, and plan-digest
labels. The adapter retains each returned handle in memory. It verifies the
handle and all ownership labels before accepting inspection, starting the
container, or removing it. Ambiguous create failures trigger bounded
best-effort cleanup by name, but removal occurs only when the labels match.

The adapter normalizes Docker inspection into the existing sandbox inspection
contract and rejects drift before execution. The container's inspected final
state, rather than the CLI transport exit alone, supplies the agent exit code.
Raw stderr and raw inspection objects do not cross the adapter boundary.

## Consequences

- The repository now owns a concrete Docker CLI process and lifecycle adapter.
- Fake-port and subprocess tests cover command construction, ownership checks,
  output limits, abort behavior, and ambiguous-create cleanup.
- A real Docker daemon, preloaded immutable image, independent cleanup check,
  and configured integration intent are still required before claiming daemon
  fidelity or executed sandbox evidence.
- The adapter does not pull images, inject ambient credentials, discover Docker
  from `PATH`, or remove containers that fail ownership verification.
