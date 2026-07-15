# Public API

- Status: Proposed
- Owner: Maintainer

## Current Package Surface

`@mensor/contract` is the serializable contract package. It is private until
the first preview release and exports:

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

## Current Compiler Surface

`@mensor/compiler` exports:

```ts
export interface CheckProjectOptions {
  readonly root: string;
  readonly configFile?: string;
  readonly producerVersion?: string;
  readonly limits?: {
    readonly maxFiles?: number;
    readonly maxFileBytes?: number;
  };
}

export function checkProject(
  options: CheckProjectOptions,
): Promise<CheckResult>;
```

`CheckProjectResult` separates a completed check and its `DiagnosticReport` from
configuration, filesystem, and unexpected compiler failures. Project placement
violations are diagnostics in a successful compiler result; malformed contracts
and unreadable inputs are typed failures.

The compiler walks the configured source root in code-unit sorted order, skips
symlinks, enforces file-count and file-byte limits, and never imports inspected
source. It currently implements action-handler placement plus static HTML form
linking for required-field presence and rejection of named fields that are
neither bound nor explicitly ignored. It also compares static form method and
resolved action facts with the linked action route. Omitted and empty actions
resolve through the optional contract `documentPath`, which becomes required
for those forms, while non-empty literal actions remain backward compatible.
Action mismatch facts expose the source of the resolved path. The compiler
rejects checkbox or repeated select controls bound to the v1 scalar text decoder. Radio controls sharing one
form and wire name are one scalar field, while inert `template` content is not
part of the static form index. Additional codec families remain later behavior.
It extracts explicit TypeScript/JavaScript exports, ignores lexically shadowed
CommonJS-like calls, resolves local import edges, and applies optional
project-owned direct or transitive role boundaries. Handler and boundary rules
share one lazy source-fact index so each source file is read and parsed at most
once per check. External package imports remain graph leaves.
Optional ownership rules also enforce suffix-based test and i18n slots without
inferring a feature owner from file content or naming conventions.

## Export Policy

- Only paths declared in package `exports` are public.
- Internal parser, Ajv, schema compilation, and issue-normalization modules are
  not deep-import contracts.
- Public values crossing package boundaries are immutable and serializable.
- Raw JSONC trees, Ajv errors, TypeScript AST, and HTML parser trees are never
  public API.
- Database models and framework runtime objects are outside this product.

`internal/fixture-kit` is not a public API. Its repair evaluator is repository
test infrastructure and may change with the fixture corpus without a public
compatibility promise.

## Current CLI Surface

`@mensor/cli` exports `runCli(options)` for process-isolated testing and host
embedding, plus the `mensor` executable. The library function receives argv,
cwd, stdout, and stderr ports explicitly and returns an exit status without
mutating global process state. The executable is the only module that writes to
the real process streams and `process.exitCode`.

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

Version `0.0.47` adds optional `form.documentPath` authoring and adds the
required `actualActionSource` fact to `form.action_mismatch`. The latter is a
pre-release breaking diagnostic shape change; no preview compatibility promise
exists yet.

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

The aggregate validation packs all three publishable packages and forces the
local tarballs into an isolated consumer. Public third-party dependencies use
normal package-manager resolution. The consumer must execute the installed
`mensor` binary successfully for a valid fixture and return the documented
diagnostic exit status for an invalid fixture.
