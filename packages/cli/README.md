# @0disoft/mensor-cli

Command-line interface for checking and compiling Mensor project contracts.

## Install

```text
pnpm add --save-dev @0disoft/mensor-cli
```

Node.js 22 or newer is required.

## Check A Project

Run the default DiagnosticReport v1 output:

```text
pnpm exec mensor check . --json
```

Select Check Output v2 when the consumer needs explicit inspection coverage:

```text
pnpm exec mensor check . --json --report-version 2
```

Exit status `0` means every configured static contract check passed. It does
not prove runtime application behavior. When a project omits RouteIndex,
application route declarations are not inspected.

Mensor does not execute project source or configuration while checking it.

## Compile A Runtime Manifest

Compile only after all configured checks pass and atomically replace the
root-relative output file:

```text
pnpm exec mensor compile . --out .mensor/manifest.json
```

The default output is `.mensor/manifest.json`. Diagnostic, configuration, and
write failures do not replace an existing manifest. Add `--json` to emit the
same canonical manifest bytes to stdout after the file is written.

## Produce A Hono RouteIndex

Generate a canonical RouteIndex from explicitly selected Hono source files and
receiver identifiers:

```text
pnpm exec mensor index-hono-routes . --source src/routes.ts --receiver app
```

Repeat `--source` and `--receiver` when needed. The default output is
`mensor.route-index.json`; `--out` selects another root-relative path and
`--json` emits the same canonical bytes after the atomic write. Mensor parses
source without importing or executing it. Only direct or chained static
`receiver.get()` and `receiver.post()` calls are supported. Dynamic paths,
mounted routers, `on`, `all`, and optional chains fail closed rather than
producing an incomplete index.

## Documentation

- [Project and feature contract authoring](https://github.com/0disoft/mensor/blob/main/packages/contract/spec/README.md)
- [CLI command contract](https://github.com/0disoft/mensor/blob/main/docs/cli/command-contract.md)
- [Product boundary](https://github.com/0disoft/mensor#product-boundary)

Mensor is licensed under Apache-2.0.
