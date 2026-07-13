# ADR 0022: Port conformance is probe-based, not trust proof

## Status

Accepted.

## Context

An injected Docker execution port can type-check while ignoring timeout,
output-limit, nonzero-exit, or cleanup behavior. Unit tests of the orchestration
layer do not prove that another adapter follows the same contract.

## Decision

The agent runner owns `docker-sandbox-execution-port/v1` conformance probes. A
single immutable probe image receives four fixed modes: success, timeout,
output-limit, and nonzero-exit. The harness runs every mode through the atomic
lifecycle and requires one successful create and one remove call per case.

The canonical report stores adapter identity, immutable probe identity, plan and
expected-output digests, case outcomes, and derived counts. It excludes paths,
container IDs, timestamps, output bytes, and raw errors.

Conformance proves behavior observed through the port API. It does not prove
that the adapter faithfully reported Docker daemon state or removed the actual
container. Descriptor v2 and public repair-rate eligibility remain blocked.

## Consequences

- Future daemon adapters get one reusable compatibility gate.
- Failure probes cannot be replaced by an always-successful fake.
- Independent daemon-state verification remains a separate requirement.
