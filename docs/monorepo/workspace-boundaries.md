# Workspace Boundaries

- Status: Proposed
- Owner: Maintainer

## Workspace Sequence

```text
packages/
  contract/
  compiler/
  cli/
internal/
  fixture-kit/
  agent-runner/
fixtures/
  valid/
  invalid/
  compound/
```

The contract, compiler, CLI, fixture-kit, and agent-runner packages are current.
Each package was introduced with a complete vertical slice. Empty packages
reserved for a possible runtime, adapter, SDK, or formatter are forbidden.

## Package Ownership

### `@mensor/contract`

Owns serializable contract types, normalized IR, diagnostic types, schema
versions, validators, and canonicalization rules. It must not depend on the
filesystem, TypeScript compiler API, HTML parsers, or CLI concerns.

### `@mensor/compiler`

Owns deterministic discovery, JSONC loading, TypeScript and HTML fact
extraction, semantic linking, rules, and report construction. It depends on the
contract package and parser libraries. It must not depend on the CLI or execute
inspected source.

The current implementation covers bounded source discovery, feature contracts,
handler linkage, file-role classification, placement diagnostics, static HTML
form extraction, and explicit handler export facts. TypeScript import edges
are normalized for configured direct and transitive role boundaries.
Suffix-based ownership rules keep test and i18n resources inside their declared
feature slots.

### `@mensor/cli`

Owns argument parsing, config selection, stdout and stderr behavior, exit
status, and future atomic artifact writes. It delegates all checking behavior
to the compiler and does not parse source directly.

The current executable exposes only `mensor check [root] [--config <path>]
[--json]` and maps compiler results to the documented `0/1/2/3` exit statuses.

### `internal/fixture-kit`

Owns fixture execution, canonical snapshots, randomized discovery tests,
security sentinels, the agent-trial report schema and canonical serializer,
and repair evaluation helpers. It may depend on public
packages but is private and never appears in a published dependency graph.

The current repair evaluator captures hashes for explicitly protected contract
files, reruns the compiler, and invokes a trusted semantic application check.
A repair succeeds only when all three gates pass: the compiler is clean, no
protected file changed, and application semantics remain intact.

The fixture kit also owns a provider-neutral trial state machine and report
aggregation. Provider SDKs, credentials, shell execution, network access, raw
prompts, and transcripts remain outside this package.

### `internal/agent-runner`

Owns bounded external command execution for trial adapters. It depends on the
fixture kit's provider-neutral types. It must remain private and must not become
a dependency of the compiler, CLI, or published packages.

It also owns canonical execution descriptors and trial-evidence envelopes.
Those artifacts identify comparable evaluation cohorts without moving command
paths, environment values, prompts, transcripts, or credentials into reports.

## Dependency Rules

```text
contract <- compiler <- cli
               ^
               +-- fixture-kit <- agent-runner
```

- Cross-package imports use declared public exports.
- Circular package dependencies are forbidden.
- Test helpers do not leak into production exports.
- Parser-specific types remain private to compiler extraction modules.
- Package boundary tests must inspect both workspace metadata and source
  imports.

## Versioning

Public packages use one fixed version during `0.x` to avoid compatibility
matrices before the boundaries settle. Serialized contract, diagnostic-report,
and future artifact schema versions remain independent from the package
version.

## Change Coordination

A change to a serialized contract must update its validator, canonical form,
fixtures, CLI examples, and compatibility note in one pull request. A compiler
rule may change without a contract-package release only when no public type,
schema, diagnostic meaning, or canonical output changes.

## Deferred Packages

Reference runtime, framework adapters, SARIF formatter, language server, and
benchmark packages are deferred. Add one only after an implemented consumer
proves an ownership boundary that cannot remain internal.
