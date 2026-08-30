# System Boundary

- Status: Active

## Owned Components

Mensor owns six implementation boundaries for the current diagnostic,
runtime-consumer, and
evaluation preview:

- contract: serializable authoring contracts, normalized IR, diagnostics, and
  validators;
- compiler: discovery, source parsing, normalized facts, semantic linking, and
  pure rules;
- CLI: arguments, config selection, output routing, and exit status; and
- reference runtime: bounded RuntimeManifest dispatch, form decoding, schema
  validation, and host-injected action guard and handler ports; and
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
                               |
                         semantic project
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
extraction boundary. Rules receive only Mensor-owned serializable facts.
TypeScript source is parsed at most once and only when a handler or configured
boundary reaches it. File roles are classified before parsing. Direct
boundaries load only their from-role roots; transitive boundaries use one
deterministic multi-source traversal and retain parent pointers until a
canonical shortest witness chain is needed. Shared reachable modules and their
non-literal dynamic imports are therefore analyzed once per boundary. Facts
distinguish runtime and type exports, literal ESM and CommonJS edges, and
computed runtime targets. Feature ownership and role classification share
longest-root-first resolution so the same file cannot acquire different owners
in separate rules.

## Dependency Direction

```text
@0disoft/mensor-cli -> @0disoft/mensor-compiler -> @0disoft/mensor-contract
internal/agent-runner -> internal/fixture-kit ------^          ^
@0disoft/mensor-reference-runtime ------------------------------+
```

The contract package has no filesystem or parser dependency. The compiler does
not depend on the CLI. Published packages never depend on fixture, runner, or
benchmark code.

## Trust Boundary

The inspected repository is untrusted input. The compiler must not execute its
source or config, invoke package loaders, follow symlinks outside the root,
access the network, or include source literals in canonical diagnostics.

All configured paths are root-relative. Absolute paths, `..` escapes, and
symlink escapes fail closed. Source discovery has explicit file-count,
per-file byte, aggregate byte, and directory-depth limits. Parser nesting
limits remain parser-owned and must be explicit before support for more complex
authoring formats is claimed.

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

The bounded reference runtime consumes the manifest through an exact injected
handler registry and mandatory action guard. It serves static GET pages and
decodes validated URL-encoded POST input, but it is not a production framework.
The compiler and reference runtime do not own authentication, CSRF policy,
sessions, persistence, or deployment.

## Failure Model

- Project violations return a typed diagnostic report.
- Invalid configuration returns a configuration failure suitable for JSON or
  human output.
- Filesystem and internal failures remain distinct from contract violations.
- Unsupported dynamic behavior produces an explicit diagnostic instead of a
  false claim that the project is valid.
