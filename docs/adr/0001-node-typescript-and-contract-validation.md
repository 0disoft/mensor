# ADR-0001: Node, TypeScript, and Contract Validation

- Status: Accepted
- Owner: Maintainer

## Context

Mensor needs a Node ESM build, a future TypeScript Compiler API consumer, strict
JSONC parsing, JSON Schema Draft 2020-12 validation, and publishable schema
artifacts. Choosing the normal TypeScript 7 compiler without checking its API
surface would split the build tool from the compiler API needed by the product.

## Decision

- Support Node.js 22 or newer.
- Use pnpm 11.11.0 workspaces.
- Use `@typescript/typescript6` 6.0.2 and its `tsc6` command for build,
  declarations, and the future Compiler API boundary.
- Use `jsonc-parser` 3.3.1 for JSONC text, offsets, and duplicate-key evidence.
- Use Ajv 8.20.0 in strict Draft 2020-12 mode for runtime schema validation.
- Keep schemas in `packages/contract/spec` and copy those exact files into the
  package build. Do not keep a second root schema copy.
- Pin direct toolchain and runtime dependency versions and commit the pnpm
  lockfile.

The version choices were refreshed from the official Node.js release page and
the npm package pages before adoption. They are repository pins, not claims that
the same versions will remain current.

## Consequences

- The contract package has two small runtime dependencies and no install or
  postinstall script.
- TypeScript 7 can be evaluated later as a separate compiler-verification
  track, but it does not replace the TS6 API track until compiler API and
  declaration compatibility are proven.
- JSON Schema is the runtime validation source. TypeScript interfaces remain a
  derived surface protected by positive and negative fixtures.
- A future switch from Ajv or `jsonc-parser` is localized inside the contract
  package because third-party error and tree types are not exported.

## Reconsider When

- TypeScript 7 provides and documents the Compiler API surface Mensor needs;
- the Node.js 22 support window no longer matches the release policy; or
- standalone generated validators materially reduce package cost without
  creating generated-source drift.

## References

- [Node.js releases](https://nodejs.org/en/about/previous-releases)
- [TypeScript 6 API package](https://www.npmjs.com/package/@typescript/typescript6)
- [jsonc-parser](https://www.npmjs.com/package/jsonc-parser)
- [Ajv](https://www.npmjs.com/package/ajv)
