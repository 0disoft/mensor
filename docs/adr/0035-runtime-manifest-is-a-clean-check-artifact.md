# ADR-0035: RuntimeManifest Is a Clean-Check Artifact

- Status: Accepted
- Date: 2026-08-16

## Context

Diagnostics prove structural contracts but do not give an independent consumer
a source-free execution artifact. Letting a runtime rescan source would duplicate
compiler semantics and reopen source-execution and parser dependencies.

## Decision

The compiler emits canonical RuntimeManifest v1 only after a completed check
with zero diagnostics. Static GET page HTML and POST action input contracts are
copied into the artifact. Action implementations cross the boundary only as
stable handler ids; the host injects executable functions separately.

Compilation reuses verified source reads from the same analysis. The manifest
does not contain source paths, exports, parser objects, timestamps, or runtime
handles.

## Consequences

- A runtime package can depend on the contract package without depending on the
  compiler or source parsers.
- Failed checks cannot leave a plausible partial manifest.
- Static HTML is intentionally embedded and may contain application content;
  users must treat the artifact as deployable application data.
- Authentication, CSRF, sessions, persistence, and deployment remain host
  responsibilities.
