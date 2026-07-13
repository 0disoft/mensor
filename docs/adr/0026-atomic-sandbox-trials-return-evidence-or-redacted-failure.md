# ADR 0026: Atomic sandbox trials return evidence or redacted failure

## Status

Accepted.

## Context

A caller could previously run a mutation, invoke a sandbox, produce a report,
and assemble trial-evidence v2 through separate APIs. Strong artifact binding
does not prove that the report came from the same sandbox invocation. Failures
during create, inspect, execution, cleanup, or final verification also need a
stable result that cannot be mistaken for completed evidence.

## Decision

`runSandboxAgentTrial` owns one fixed preflight, mutation, sandbox execution,
final-state verification, report creation, descriptor creation, and evidence
construction workflow. Preflight validates the plan, conformance artifact,
execution metadata, workspace root, execution port, cleanup timeout, and report
producer before mutation or container creation.

The runner uses the same canonical diagnostic-input encoder and agent-output
parser as the local command adapter. It captures runtime attestation only from
the sandbox invocation used as the trial adapter. A success outcome means an
auditable evidence envelope was created; the embedded trial may still record an
agent failure or unsuccessful repair.

Create, inspect, execution, cleanup, setup, or final binding failures return a
canonical redacted failure receipt with stage, category, and an optional
canonical trial report. They never return partial evidence or raw error text.

## Consequences

- A successful outcome binds report creation to the same in-process sandbox
  workflow that produced the runtime attestation.
- Cleanup failure cannot be represented as successful evidence.
- Invalid configuration fails before mutation and port invocation.
- Invalid agent output can remain useful failed-trial evidence when execution,
  attestation, cleanup, and final-state verification completed.
- The runner still depends on an injected execution port. It does not prove
  that the port faithfully represented a real Docker daemon, so public
  repair-rate eligibility remains false.
