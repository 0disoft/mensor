# Mensor

Mensor is a deterministic contract checker for agent-edited, server-rendered
HTML applications.

The runnable [`examples/dogfood-tasks`](examples/dogfood-tasks/) application
keeps compiler checks tied to real GET/POST behavior instead of fixtures alone.

The project turns architectural knowledge that normally lives in a maintainer's
head into machine-readable project contracts. It links static HTML forms,
action input contracts, optional source-bound route facts, source-file roles,
import boundaries, and feature ownership, then reports violations in stable
JSON that a person, CI job, or coding agent can act on.

## Status

Version `0.10.2` is the current release candidate. It adds human guidance for
missing project contracts and has not been published.

Version `0.10.1` is the published public preview. It improves human-readable
enum decoder errors. All four packages are published to npm through the OIDC
release workflow and passed isolated registry installation checks.

## Registry Installation

Install the CLI in your application's existing package directory:

```text
pnpm add --save-dev @0disoft/mensor-cli@0.10.1
```

Before the first check, create `mensor.project.jsonc` at the application root
and the feature contracts it lists. Follow the
[complete contract authoring example](packages/contract/spec/README.md#complete-authoring-example)
and adapt its paths, form identity, field names and handler export to your
actual application. Installation does not create these files; Mensor has no
`init` command and does not generate application code.

For a complete static-HTML reference, inspect the existing
[tiny-tasks fixture](fixtures/valid/tiny-tasks/): its project contract lists
`src/features/tasks/feature.mensor.jsonc`, which links `views/index.html` and
the `createTask` export in `server/create-task.ts`. Both source paths are
relative to that feature contract. Keep your application's files and behavior;
the fixture is a reference, not a replacement application.

From the directory containing `mensor.project.jsonc`, run:

```text
pnpm exec mensor check . --json
pnpm exec mensor check . --json --report-version 2
```

Exit `0` means the configured checks passed; revision 2 also reports which
checks ran in `inspection`. Exit `1` reports source/contract mismatches in
`diagnostics`. Exit `2` reports configuration problems in `failure`; correct
those before interpreting a check as a pass. For a concrete correction, see
[check, correct, and recheck](packages/contract/spec/README.md#check-correct-and-recheck).
Application runtime tests remain separate.

The following are optional workflows, not additional setup steps. Static HTML
does not need a FormIndex producer. Use an indexer only for the matching source
format, replace the example source paths and identifiers with real ones, and
configure the resulting `routeIndex` or `formIndex` in the project contract.
Compile a runtime manifest only when you need that artifact after a clean check.

```text
pnpm exec mensor check . --sarif
pnpm exec mensor compile . --out .mensor/manifest.json
pnpm exec mensor index-hono-routes . --source src/routes.ts --receiver app
pnpm exec mensor index-ts-forms . --source src/views.ts --tag html
```

After publication, the candidate can be installed with

```text
pnpm add --save-dev @0disoft/mensor-cli@0.10.2
```

See the [`0.10.2` candidate note](docs/releasing/0.10.2.md), the
[`0.10.1` release note](docs/releasing/0.10.1.md), the
[release runbook](docs/releasing/runbook.md), the [`0.10.0` migration
note](docs/releasing/0.10.0.md), and the prior
[`0.2.0` release audit](docs/product/0.2.0-release-audit.md) for the publication
process and compatibility boundary.

## Contract Path Bases

Mensor uses two path bases. Project-level discovery paths do not become
`sourceRoot`-relative merely because discovered source lives below that root.

| Contract field | Path base |
| --- | --- |
| `sourceRoot` | project root |
| `featureContracts[]` | project root; include the `sourceRoot` prefix when applicable |
| `formIndex` | project root |
| `routeIndex` | project root |
| `fileRoles[].withinFeature` | directory containing the feature contract |
| action `form.template` | directory containing the feature contract |
| action `handler.file` | directory containing the feature contract |

For example, a feature contract stored at
`src/features/guestbook/feature.mensor.jsonc` is listed by that complete path
in `featureContracts`, while its handler may be declared as
`server/create-entry.ts` inside the feature contract.

## Source Checkout

The current preview runs from a source checkout with Node.js 22 or newer and
pnpm 12:

```text
pnpm install --frozen-lockfile
pnpm build
pnpm mensor check fixtures/valid/tiny-tasks --json
pnpm mensor check fixtures/valid/tiny-tasks --json --report-version 2
pnpm mensor compile fixtures/valid/tiny-tasks --out .mensor/manifest.json
pnpm mensor index-hono-routes fixtures/valid/hono-static-tasks --source src/features/tasks/routes/tasks.mjs --receiver app
```

Both check commands exit `0`. The first preserves DiagnosticReport v1; the
second adds compiler-derived inspection states through Check Output v2. To
inspect a deterministic contract failure, run:

```text
pnpm mensor check fixtures/invalid/form-field-missing --json
```

That command exits `1` and reports `form.field_missing`. The complete project
and feature contract authoring example lives in
[`packages/contract/spec/README.md`](packages/contract/spec/README.md). This is
the contributor path for exercising the current source tree; registry
installation is the supported consumer path.

## First Proof

The current proof:

1. loads JSONC project and feature contracts without executing project code;
2. extracts static HTML forms and TypeScript/JavaScript source facts;
3. detects form, route, handler, import-boundary, placement, and ownership
   violations;
4. emits byte-stable diagnostics through `mensor check --json`;
5. atomically writes RuntimeManifest v1 only after a clean compile; and
6. rejects checker-clean repairs that weaken a protected contract or delete
   feature semantics.

## Product Boundary

Mensor is not a web framework, router, template engine, ORM, deployment
platform, or LLM wrapper. It does not replace htmx, Turbo, Unpoly, LiveView,
Livewire, or a server framework. It checks contracts around applications built
with those kinds of tools.

The built-in provider supports TypeScript or JavaScript projects with static
`.html` files. A public canonical FormIndex can instead supply source-bound
facts for other template files; unresolved evidence fails closed and no
producer is run by the compiler. The CLI can explicitly index caller-selected
TypeScript or JavaScript files containing no-substitution templates tagged by
caller-selected identifiers. Interpolation marks a document incomplete, and
the producer never imports or executes the source.
An optional canonical RouteIndex lets an explicit producer supply static route
facts without granting the compiler code-execution authority. The CLI includes
one narrow Hono producer for explicitly listed source files and receiver names.
It accepts only static direct or chained `get` and `post` calls; dynamic paths,
mounted routers, `on`, `all`, and optional chaining fail closed.
When `routeIndex` is omitted, Mensor does not inspect application route
declarations and does not run the `route.missing` rule. A passing check means
only that every configured static contract check passed; it never proves
runtime application semantics.
RuntimeManifest v1 and a bounded Request/Response reference consumer are
implemented. General dynamic-template adapters, production framework integration,
autofix, arbitrary plugins, cloud processing, and telemetry remain deferred.

## Repository Shape

- `packages/contract`: serializable contracts, diagnostics, and validation
- `packages/compiler`: discovery, source facts, semantic linking, and rules
- `packages/cli`: command parsing, output, and exit codes
- `packages/reference-runtime`: bounded manifest dispatch and form decoding
- `internal/fixture-kit`: deterministic fixture and repair-test support
- `fixtures`: valid and intentionally broken example projects

See [the product specification](docs/product/02-spec.md),
[system boundary](docs/architecture/00-system-boundary.md), and
[workspace boundaries](docs/monorepo/workspace-boundaries.md) before adding
or changing implementation boundaries.

## Contributing And Security

Contributions are accepted under the Apache License 2.0 and require a DCO 1.1
sign-off. See [CONTRIBUTING.md](CONTRIBUTING.md) and [DCO.txt](DCO.txt).
Report suspected vulnerabilities through the private process in
[SECURITY.md](SECURITY.md).

## License

Mensor is licensed under the Apache License, Version 2.0. See
[LICENSE](LICENSE).
