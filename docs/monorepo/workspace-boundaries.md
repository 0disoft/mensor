# Workspace Boundaries

- Status: Proposed
- Owner: Maintainer

## Workspace Sequence

```text
packages/
  contract/
  compiler/
  cli/
fixtures/
  valid/
  invalid/
  compound/
```

The contract, compiler, and CLI packages are current. `internal/fixture-kit` is
added only with its first complete vertical slice. Do not create a package until it contains a complete
responsibility. Empty packages reserved for a possible runtime, adapter, SDK,
or formatter are forbidden.

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
remain a planned responsibility.

### `@mensor/cli`

Owns argument parsing, config selection, stdout and stderr behavior, exit
status, and future atomic artifact writes. It delegates all checking behavior
to the compiler and does not parse source directly.

The current executable exposes only `mensor check [root] [--config <path>]
[--json]` and maps compiler results to the documented `0/1/2/3` exit statuses.

### `internal/fixture-kit`

Owns fixture execution, canonical snapshots, randomized discovery tests,
security sentinels, and repair evaluation helpers. It may depend on public
packages but is private and never appears in a published dependency graph.

## Dependency Rules

```text
contract <- compiler <- cli
    ^          ^         ^
    +---------- fixture-kit
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
