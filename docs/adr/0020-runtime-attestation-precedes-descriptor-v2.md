# ADR 0020: Runtime attestation precedes execution descriptor v2

## Status

Accepted.

## Context

A canonical Docker sandbox plan proves only intended command construction. It
does not prove that the Docker engine applied those controls. Adding the plan
digest directly to execution descriptor v2 would let configuration evidence be
mistaken for runtime evidence.

## Decision

The agent runner owns `docker-sandbox-runtime-attestation/v1`. It binds one
canonical plan digest to a collector artifact, Docker engine and platform,
immutable image identity, normalized security observations, and enforced
resource limits. Creation fails when any observation differs from the plan.

The artifact excludes workspace paths, container identifiers, timestamps,
command arguments, environment values, and raw Docker inspection output. It is
deterministic and safe to fingerprint, but it is not independently trusted:
the current API validates caller-provided observations and does not execute or
authenticate the collector.

Execution descriptor v2 must be created only by a future atomic sandbox runner
that owns container launch, observation collection, cleanup, and attestation
creation. Descriptor v1 and the public repair-rate blockers remain unchanged.

## Consequences

- Plan drift and observed-runtime drift have separate canonical digests.
- Schema-valid caller input cannot be described as trusted execution evidence.
- Public repair-rate claims remain blocked until collector provenance and the
  atomic execution path are implemented and tested.
