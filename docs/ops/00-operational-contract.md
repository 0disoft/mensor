# Operational Contract

- Status: Proposed
- Owner: Maintainer

## Operating Shape

The MVP is a local CLI and library, not a hosted service. It has no account,
database, long-running process, production traffic, telemetry, or cloud source
retention. Service SLO, RTO, and RPO claims therefore do not apply.

## Critical Journeys

- A developer runs a human-readable check locally.
- CI runs `mensor check --json` against an untrusted change.
- A coding agent consumes the same canonical report and repairs the repository.
- A maintainer upgrades Mensor without silently changing diagnostic meaning.

## Release Blockers

- required fixtures or canonical snapshots fail;
- output changes with checkout path, platform path separator, locale, timezone,
  or discovery order;
- a security probe shows source execution, root escape, or source leakage;
- package contents differ from the declared public export surface;
- CLI help, JSON output, and exit status disagree with the command contract;
- a diagnostic code changes meaning without compatibility treatment; or
- an unconfigured validation is presented as passing.

## Release and Recovery

Preview packages use `0.x` versions. A release must be reproducible from the
public repository and must not depend on private evaluation data. A broken
release is recovered by publishing a corrected version and documenting any
diagnostic or schema impact; mutable replacement of an existing package version
is forbidden.

## Observability and Privacy

The CLI may emit explicit debug information to stderr when requested, but
canonical JSON remains free of timing, host, and source-content data. The tool
does not send telemetry or crash reports. Users remain responsible for deciding
whether project-relative paths, routes, field names, and import specifiers may
be shared with an external coding agent.

## Deferred Operations

Hosted evaluation, retained transcripts, remote caching, and a documentation
site require separate privacy, retention, credential, incident, and deletion
contracts before implementation.
