# ADR-0010: Keep the Bounded Command Runner in a Separate Package

- Status: Accepted
- Date: 2026-07-11

## Context

The deterministic fixture kit must remain free of shell, process, network, and
credential responsibilities. Real agent evaluation eventually needs an
external command boundary.

## Decision

Place command execution in the private `internal/agent-runner` package. The
runner implements one narrow stdin/stdout protocol, absolute executables,
`shell: false`, an explicit environment allowlist, timeout, output limit, and
process-tree termination. It depends on fixture-kit types; fixture-kit does not
depend on the runner.

## Consequences

- Deterministic scoring remains usable without process authority.
- Command execution can be audited or replaced without changing compiler or
  fixture contracts.
- This boundary is not an OS sandbox and does not authorize real provider
  credentials or unrestricted network access.
