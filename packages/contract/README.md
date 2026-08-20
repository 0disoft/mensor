# @0disoft/mensor-contract

Serializable contracts, schemas, and deterministic diagnostics for Mensor.

## Install

```text
pnpm add @0disoft/mensor-contract
```

Node.js 22 or newer is required.

## Parse Contracts And Reports

```js
import {
  parseCheckOutputV2,
  parseFormIndex,
  parseProjectContract,
  parseRouteIndex,
  parseRuntimeManifest,
  serializeFormIndex,
  serializeRouteIndex,
  serializeRuntimeManifest,
} from "@0disoft/mensor-contract";
```

Parsers return explicit success or failure values. The package contains no
filesystem scanner or application runtime.

Published schemas are available through package export paths, including:

```js
const projectSchema = import.meta.resolve(
  "@0disoft/mensor-contract/schemas/project-contract-v1.schema.json",
);
const formIndexSchema = import.meta.resolve(
  "@0disoft/mensor-contract/schemas/form-index-v1.schema.json",
);
const checkOutputSchema = import.meta.resolve(
  "@0disoft/mensor-contract/schemas/check-output-v2.schema.json",
);
const runtimeManifestSchema = import.meta.resolve(
  "@0disoft/mensor-contract/schemas/runtime-manifest-v1.schema.json",
);
```

## Documentation

- [Contract authoring](https://github.com/0disoft/mensor/blob/main/packages/contract/spec/README.md)
- [Public API and compatibility](https://github.com/0disoft/mensor/blob/main/docs/library/public-api.md)
- [FormIndex v1](https://github.com/0disoft/mensor/blob/main/docs/architecture/form-index-v1.md)
- [RouteIndex v1](https://github.com/0disoft/mensor/blob/main/docs/architecture/route-index-v1.md)
- [RuntimeManifest v1](https://github.com/0disoft/mensor/blob/main/docs/architecture/runtime-manifest-v1.md)

Mensor is licensed under Apache-2.0.
