# System Boundary

- Status: Proposed

## Owned Components

Mensor owns five implementation boundaries for the current diagnostic and
evaluation preview:

- contract: serializable authoring contracts, normalized IR, diagnostics, and
  validators;
- compiler: discovery, source parsing, normalized facts, semantic linking, and
  pure rules;
- CLI: arguments, config selection, output routing, and exit status; and
- fixture kit: deterministic fixtures, snapshots, security probes, and repair
  evaluation support that is never published as a runtime dependency; and
- agent runner: a private bounded process adapter plus execution-evidence
  contracts for evaluation commands.

It consumes the local filesystem and parser libraries. It does not own the
application framework, HTTP server, database, authentication, deployment, or
coding agent.

## Compiler Flow

```text
JSONC contract       TypeScript/JavaScript       static HTML
      |                        |                      |
      +------------------------+----------------------+
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
```

Parsing libraries may produce ASTs, but parser-specific objects stop at the
extraction boundary. Rules receive only Mensor-owned serializable facts.
TypeScript source is parsed once into facts that distinguish runtime and type
exports, literal ESM and CommonJS edges, and computed runtime targets. Feature
ownership and role classification share longest-root-first resolution so the
same file cannot acquire different owners in separate rules.

## Dependency Direction

```text
@mensor/contract <- @mensor/compiler <- @mensor/cli
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

All configured paths are root-relative. Absolute paths, `..` escapes, and
symlink escapes fail closed. File count, file size, and parser nesting limits
must be explicit before untrusted CI use is claimed.

## Adapter Boundary

The MVP has no generic plugin interface. A future language adapter may emit a
versioned normalized index such as forms or module edges. It must not inject
arbitrary lifecycle hooks or pass framework objects into compiler rules.

## Runtime Boundary

There is no production runtime in the MVP. A runtime manifest or reference
consumer may be introduced only after diagnostics are proven and an independent
consumer requires it. Compiler contracts must not assume that such a runtime
will exist.

## Failure Model

- Project violations return a typed diagnostic report.
- Invalid configuration returns a configuration failure suitable for JSON or
  human output.
- Filesystem and internal failures remain distinct from contract violations.
- Unsupported dynamic behavior produces an explicit diagnostic instead of a
  false claim that the project is valid.
