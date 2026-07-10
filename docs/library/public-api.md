# Public API

- Status: Proposed
- Owner: Maintainer

## Current Package Surface

`@mensor/contract` is the only implemented package. It is private until the
first preview release and exports:

- `parseJsonc(text)` for strict JSONC parsing with duplicate-key detection;
- `parseProjectContract(text)`;
- `parseFeatureContract(text)`;
- `parseDiagnosticReport(text)`;
- `isJsonValue(value)`; and
- serializable contract, diagnostic, issue, and result types.

Each parser returns `ContractResult<T>`. Syntax, duplicate-key, and schema
failures are values with deterministic issues; they are not thrown exceptions.
The parser does not read files, execute configuration, mutate input, inject
schema defaults, or access the network.

## Planned Compiler Surface

The compiler package is not created until its first vertical slice exists. Its
planned entry point remains:

```ts
export interface CheckProjectOptions {
  readonly root: string;
  readonly configFile?: string;
}

export function checkProject(
  options: CheckProjectOptions,
): Promise<CheckResult>;
```

The final success and failure union will be defined with the compiler fixture,
not guessed in advance.

## Export Policy

- Only paths declared in package `exports` are public.
- Internal parser, Ajv, schema compilation, and issue-normalization modules are
  not deep-import contracts.
- Public values crossing package boundaries are immutable and serializable.
- Raw JSONC trees, Ajv errors, TypeScript AST, and HTML parser trees are never
  public API.
- Database models and framework runtime objects are outside this product.

## Schema Ownership

The package-local `packages/contract/spec` directory is the schema source of
truth. TypeScript interfaces are derived public surfaces and must remain aligned
through fixture and negative validation tests. The build copies the exact schema
files into `dist/spec`; package exports expose only those copied artifacts. A
second hand-maintained schema copy is forbidden.

## Compatibility

All packages use a shared `0.x` version initially. Breaking changes are allowed
during private pre-release development. Once packages are published, every
breaking public change requires release notes and migration guidance.

Serialized contracts carry their own schema version. Package version and
schema version do not advance together unless both implementation and wire
format change. A public diagnostic code cannot silently change meaning.

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
