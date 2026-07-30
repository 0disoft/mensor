# @0disoft/mensor-cli

Command-line interface for checking Mensor project contracts.

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

## Documentation

- [Project and feature contract authoring](https://github.com/0disoft/mensor/blob/main/packages/contract/spec/README.md)
- [CLI command contract](https://github.com/0disoft/mensor/blob/main/docs/cli/command-contract.md)
- [Product boundary](https://github.com/0disoft/mensor#product-boundary)

Mensor is licensed under Apache-2.0.
