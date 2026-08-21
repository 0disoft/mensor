# @0disoft/mensor-cli

Command-line interface for checking Mensor project contracts and compiling a
clean project to RuntimeManifest v1.

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

## Compile A Runtime Manifest

Write canonical RuntimeManifest v1 JSON to stdout:

```text
pnpm exec mensor compile .
```

Atomically replace a project-root-relative output file:

```text
pnpm exec mensor compile . --output generated/runtime-manifest.json
```

Compilation emits a manifest only after a completed check with zero diagnostics.
Diagnostics remain canonical DiagnosticReport v1 JSON on stdout and exit `1`;
the selected output file is not created or replaced. Successful file output is
silent and rejects paths or parent symlinks that escape the selected project
root.

RuntimeManifest embeds static HTML and should be handled as deployable
application data. Executable handlers, authentication, sessions, CSRF,
persistence, and HTTP serving remain host responsibilities.

Mensor does not execute project source or configuration while checking or
compiling it.

## Documentation

- [Project and feature contract authoring](https://github.com/0disoft/mensor/blob/main/packages/contract/spec/README.md)
- [CLI command contract](https://github.com/0disoft/mensor/blob/main/docs/cli/command-contract.md)
- [RuntimeManifest v1](https://github.com/0disoft/mensor/blob/main/docs/architecture/runtime-manifest-v1.md)
- [Product boundary](https://github.com/0disoft/mensor#product-boundary)

Mensor is licensed under Apache-2.0.
