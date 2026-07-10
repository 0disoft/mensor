# Mensor

Mensor is a working name for a deterministic contract checker for
agent-edited, server-rendered HTML applications.

The project turns architectural knowledge that normally lives in a maintainer's
head into machine-readable project contracts. It links static HTML forms,
action input contracts, source-file roles, import boundaries, and feature
ownership, then reports violations in stable JSON that a person, CI job, or
coding agent can act on.

## Status

The repository is in pre-implementation design. No package has been published
and no compatibility promise exists yet.

## First Proof

The first vertical slice will:

1. load a JSONC project contract without executing project code;
2. parse one static HTML form and one TypeScript action contract;
3. detect a missing, unexpected, or incompatible form field;
4. emit byte-stable diagnostics through `mensor check --json`; and
5. prove that a coding agent can repair the defect without weakening the
   contract or deleting the feature.

## Product Boundary

Mensor is not a web framework, router, template engine, ORM, deployment
platform, or LLM wrapper. It does not replace htmx, Turbo, Unpoly, LiveView,
Livewire, or a server framework. It checks contracts around applications built
with those kinds of tools.

The MVP supports TypeScript or JavaScript projects with static `.html` files.
Dynamic template languages, runtime manifests, production HTTP handling,
autofix, arbitrary plugins, cloud processing, and telemetry are deferred.

## Planned Repository Shape

- `packages/contract`: serializable contracts, diagnostics, and validation
- `packages/compiler`: discovery, source facts, semantic linking, and rules
- `packages/cli`: command parsing, output, and exit codes
- `internal/fixture-kit`: deterministic fixture and repair-test support
- `fixtures`: valid and intentionally broken example projects

See [the product specification](docs/product/02-spec.md),
[system boundary](docs/architecture/00-system-boundary.md), and
[workspace boundaries](docs/monorepo/workspace-boundaries.md) before adding
implementation structure.
