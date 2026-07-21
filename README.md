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

Version `0.1.0` is the first public preview. The diagnostic-first MVP is
implemented, exercised by canonical fixtures, and published as the contract,
compiler, and CLI packages under the `@0disoft` npm scope.

## Registry Installation

The supported CLI installation path is:

```text
pnpm add --save-dev @0disoft/mensor-cli@0.1.0
pnpm exec mensor check . --json
```

See the [release runbook](docs/releasing/runbook.md) and [`0.1.0` migration
note](docs/releasing/0.1.0.md) for the publication and compatibility boundary.

## Source Checkout

The current preview runs from a source checkout with Node.js 22 or newer and
pnpm 11:

```text
pnpm install --frozen-lockfile
pnpm build
pnpm mensor check fixtures/valid/tiny-tasks --json
```

The last command exits `0` and prints one canonical JSON report with
`"status": "passed"`. To inspect a deterministic contract failure, run:

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
4. emits byte-stable diagnostics through `mensor check --json`; and
5. rejects checker-clean repairs that weaken a protected contract or delete
   feature semantics.

## Product Boundary

Mensor is not a web framework, router, template engine, ORM, deployment
platform, or LLM wrapper. It does not replace htmx, Turbo, Unpoly, LiveView,
Livewire, or a server framework. It checks contracts around applications built
with those kinds of tools.

The MVP supports TypeScript or JavaScript projects with static `.html` files.
An optional canonical RouteIndex lets an external producer supply static route
facts without granting the compiler code-execution authority.
Dynamic template languages, runtime manifests, production HTTP handling,
autofix, arbitrary plugins, cloud processing, and telemetry are deferred.

## Repository Shape

- `packages/contract`: serializable contracts, diagnostics, and validation
- `packages/compiler`: discovery, source facts, semantic linking, and rules
- `packages/cli`: command parsing, output, and exit codes
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
