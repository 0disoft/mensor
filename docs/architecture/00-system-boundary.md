# System Boundary

- Status: Active

## Owned Components

Mensor owns five implementation boundaries for the current diagnostic and
evaluation preview:

- contract: serializable authoring contracts, normalized IR, diagnostics, and
  validators;
- compiler: discovery, source parsing, normalized facts, semantic linking, pure
  rules, and source-derived contract draft construction;
- CLI: arguments, config selection, output routing, exit status, and create-only
  draft publication;
- fixture kit: deterministic fixtures, snapshots, security probes, and repair
  evaluation support that is never published as a runtime dependency; and
- agent runner: private bounded process, owned Docker CLI sandbox adapter, and
  injected-port execution-evidence workflows for repair and agent-authored
  build trials, including canonical runner, provider, model, reasoning, and
  cohort attribution.

It consumes the local filesystem and parser libraries. It does not own the
application framework, HTTP server, database, authentication, deployment, or
coding agent.

## Compiler Flow

```text
JSONC contract       TypeScript/JavaScript       static HTML       RouteIndex
      |                        |                      |                  |
      |                        |            built-in HTML provider
      |                        |                      |
      |                        |                 FormIndex
      |                        |                      |
      +------------------------+----------------------+------------------+
                               |
                    deterministic discovery
                               |
                       normalized source facts
                         /             \
                        /               \
             contract draft data      semantic project
                                             |
                                       pure rule execution
                                             |
                                canonical DiagnosticReport
                                             |
                                  clean checks only
                                             |
                                   RuntimeManifest v1
```

Parsing libraries may produce ASTs, but parser-specific objects stop at the
extraction boundary. Rules and draft construction receive only Mensor-owned
normalized facts. Draft construction returns JSONC content and relative output
paths to the caller; it never writes the inspected repository.

TypeScript source is parsed at most once and only when a handler or configured
boundary reaches it during checking. File roles are classified before parsing.
Direct boundaries load only their from-role roots; transitive boundaries use one
deterministic multi-source traversal and retain parent pointers until a
canonical shortest witness chain is needed. Shared reachable modules and their
non-literal dynamic imports are therefore analyzed once per boundary. Facts
distinguish runtime and type exports, literal ESM and CommonJS edges, and
computed runtime targets. Feature ownership and role classification share
longest-root-first resolution so the same file cannot acquire different owners
in separate rules.

## Dependency Direction

```text
@0disoft/mensor-contract <- @0disoft/mensor-compiler <- @0disoft/mensor-cli
                           ^
                           +-- internal/fixture-kit <- internal/agent-runner
```

The contract package has no filesystem or parser dependency. The compiler does
not depend on the CLI. Published packages never depend on fixture, runner, or
benchmark code.

## Trust Boundary

The inspected repository is untrusted input. The compiler must not execute its
source or config, invoke package loaders, follow symlinks outside the root,
access the network, or include source literals in canonical diagnostics.

All configured and generated paths are root-relative. Absolute paths, `..`
escapes, and symlink escapes fail closed. Source discovery has explicit
file-count, per-file byte, aggregate byte, and directory-depth limits. Parser
nesting limits remain parser-owned and must be explicit before support for more
complex authoring formats is claimed.

The CLI is the only published package allowed to mutate project files. Init
outputs are validated before publication, created without overwriting, and
published as one recoverable pair. If the second publication fails, the CLI
removes the first. A rollback failure is explicit because manual cleanup is
then required.

## Adapter Boundary

The MVP has no generic plugin interface. ADR-0030 makes the versioned,
serializable `FormIndex` the template-fact boundary. The current static HTML
extractor is its first built-in provider. Compiler rules never receive parser
nodes or framework objects.

This boundary does not authorize external execution. A future extractor may
produce an index outside the compiler, but CLI ingestion, process launching,
package loading, and freshness validation require separate decisions. Arbitrary
lifecycle hooks remain prohibited.

ADR-0033 adds `RouteIndex v1` as a public source-bound artifact. The compiler
accepts only a project-selected canonical JSON file, verifies every indexed
source digest and range through the shared source cache, and checks exact
action-route presence. It does not launch the producer or infer trust from the
producer name. Malformed or stale indexes are configuration failures;
fresh-index contract disagreement is a deterministic diagnostic.

## Runtime Boundary

RuntimeManifest v1 is an optional compiled artifact emitted only after a clean
diagnostic report. It contains static GET page HTML, POST action routes, handler
ids, and serializable input contracts. Source paths, parser objects, module
exports, and executable handlers do not cross this boundary.

There is still no production runtime. A reference consumer may use the manifest
through a separately injected handler registry, but the compiler does not own
HTTP serving, authentication, CSRF, sessions, persistence, or deployment.

## Failure Model

- Project violations return a typed diagnostic report.
- Invalid configuration returns a configuration failure suitable for JSON or
  human output.
- Filesystem and internal failures remain distinct from contract violations.
- Unsupported dynamic behavior produces an explicit diagnostic instead of a
  false claim that the project is valid.
- Init ambiguity and existing outputs are user-correctable configuration
  failures; publication and rollback failures remain filesystem failures.
