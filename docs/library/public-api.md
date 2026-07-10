# Public API

- Status: Proposed
- Owner: Maintainer

## Package Surface

### `@mensor/contract`

May export serializable project-contract, schema, diagnostic, source-location,
and report types; pure validators; and canonicalization helpers. It does not
export classes, parser objects, filesystem helpers, or mutable registries.

### `@mensor/compiler`

The initial library surface is one operation:

```ts
export interface CheckProjectOptions {
  readonly root: string;
  readonly configFile?: string;
}

export interface CheckResult {
  readonly ok: boolean;
  readonly report: DiagnosticReport;
}

export function checkProject(
  options: CheckProjectOptions,
): Promise<CheckResult>;
```

The final implementation may refine the success and failure union before the
first preview, but contract violations remain values rather than thrown
exceptions. Unexpected I/O and internal defects may reject the promise with a
documented error type.

## Export Policy

- Only paths declared in package `exports` are public.
- Internal parser, graph, rule-runner, and cache modules are not deep-import
  contracts.
- Public values crossing package boundaries are immutable and serializable.
- Raw TypeScript AST, HTML parser trees, and third-party schema objects are
  never public API.
- Database models and framework runtime objects are outside this product.

## Compatibility

All packages use a shared `0.x` version initially. Breaking changes are allowed
during pre-release development but require release notes once packages are
published. A public diagnostic code cannot silently change meaning, even while
the TypeScript type surface remains source-compatible.

Serialized contracts carry their own schema version. Package version and
schema version do not advance together unless both implementation and wire
format change.

## Deprecation

Before `1.0`, a published public API should be deprecated for at least one
minor release when a safe compatibility wrapper is practical. Diagnostic codes
are reserved after removal. Migration notes must state whether consumers need
source changes, config changes, snapshot updates, or only a package upgrade.

## Artifact Policy

Published packages contain compiled code, declarations, licenses, and directly
owned schemas or documentation only. Fixtures, benchmarks, private evaluation
data, source maps containing absolute local paths, and repository operations
documents are excluded unless a consumer contract explicitly requires them.
