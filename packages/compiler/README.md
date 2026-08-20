# @0disoft/mensor-compiler

Deterministic source contract checker and draft generator for Mensor projects.

## Install

```text
pnpm add @0disoft/mensor-compiler
```

Node.js 22 or newer is required.

## Draft Project Contracts

```js
import { draftProjectContracts } from "@0disoft/mensor-compiler";

const result = await draftProjectContracts({
  root: process.cwd(),
  featureRoot: "src/features/guestbook",
  featureId: "guestbook",
  handlerRole: "server",
});

if (result.ok) {
  process.stdout.write(result.project.content);
  process.stdout.write(result.feature.content);
}
```

The API returns content and paths but never writes files. It discovers one
static POST form and one explicit named runtime export without executing project
source. Ambiguous candidates require exact form and handler selectors.

## Check A Project

```js
import { checkProject } from "@0disoft/mensor-compiler";

const result = await checkProject({ root: process.cwd() });

if (!result.ok) {
  process.exitCode = 1;
}

process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
```

## Compile A Runtime Manifest

```js
import { compileProject } from "@0disoft/mensor-compiler";

const result = await compileProject({ root: process.cwd() });
if (result.ok) {
  process.stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`);
}
```

The compiler emits a manifest only after every configured diagnostic passes.
The artifact contains static GET page HTML, POST routes, handler ids, and form
decode contracts; it contains no source path, AST node, or executable handler.

The default result contains DiagnosticReport v1. Select Check Output v2
explicitly when inspection coverage is required:

```js
const result = await checkProject({
  root: process.cwd(),
  reportVersion: 2,
});
```

Contract failures are returned as data. The compiler reads supported project
files but does not
execute project source or configuration, spawn framework tools, install
dependencies, or access the network.

## Documentation

- [Library API](https://github.com/0disoft/mensor/blob/main/docs/library/public-api.md)
- [System boundary](https://github.com/0disoft/mensor/blob/main/docs/architecture/00-system-boundary.md)
- [Check Output v2](https://github.com/0disoft/mensor/blob/main/docs/architecture/check-output-v2.md)
- [RuntimeManifest v1](https://github.com/0disoft/mensor/blob/main/docs/architecture/runtime-manifest-v1.md)

Mensor is licensed under Apache-2.0.
