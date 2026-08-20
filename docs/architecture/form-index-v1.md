# FormIndex v1

Status: Active

Authority: ADR-0030 and ADR-0036

Schema: `packages/contract/spec/form-index-v1.schema.json`

## Purpose

FormIndex is the source-bound, serializable handoff between a template extractor
and Mensor's form rules. A producer can understand Hono templates, JSX, Astro,
Svelte, or another source language without loading that parser or framework into
the Mensor compiler.

The project contract selects one external artifact with the project-root-relative
`formIndex` field. When the field is absent, Mensor keeps using its built-in
static HTML provider. The compiler never discovers, installs, imports, or runs a
FormIndex producer.

## Public API

`@0disoft/mensor-contract` exports:

```ts
parseFormIndex(text): ContractResult<FormIndex>
serializeFormIndex(value): string
```

The package also exports the FormIndex v1 TypeScript types and the schema through
`@0disoft/mensor-contract/schemas/form-index-v1.schema.json`.

A producer writes canonical output itself instead of relying on a generic JSON
formatter:

```ts
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import {
  serializeFormIndex,
  type FormIndex,
} from "@0disoft/mensor-contract";

const path = "src/features/tasks/view.ts";
const source = await readFile(path, "utf8");
const contentDigest = `sha256:${createHash("sha256")
  .update(source)
  .digest("hex")}` as const;

const index: FormIndex = {
  schemaVersion: 1,
  producer: { name: "example/hono-form-index", version: "1.0.0" },
  documents: [{
    path,
    contentDigest,
    sourceKind: "example/hono-template",
    inspection: { state: "complete" },
    forms: extractedForms,
  }],
};

await writeFile(
  "mensor.form-index.json",
  serializeFormIndex(index),
  "utf8",
);
```

`extractedForms` must preserve source ranges and unresolved evidence. The
compiler independently re-reads `path` and rejects stale `contentDigest` values.

## Envelope

```ts
interface FormIndex {
  readonly schemaVersion: 1;
  readonly producer: {
    readonly name: string;
    readonly version: string;
  };
  readonly documents: readonly FormDocumentFact[];
}

interface FormDocumentFact {
  readonly path: string;
  readonly contentDigest: `sha256:${string}`;
  readonly sourceKind: string;
  readonly inspection: DocumentInspection;
  readonly forms: readonly IndexedFormFact[];
}
```

Every document path is project-root-relative POSIX syntax and must name a file
inside the discovered `sourceRoot`. Every digest is the lowercase SHA-256 of the
exact current source bytes. Source ranges use zero-based lines and zero-based
UTF-16 characters.

## Evidence

Literal, absent, dynamic, and unsupported values remain separate states. A
producer must report uncertainty rather than omit a form or control that may
affect the linked contract. An incomplete document inspection blocks the check.
Dynamic or unsupported evidence that Mensor cannot map to a stable diagnostic
also blocks the check.

The supported reason codes are closed by schema version. Adding a reason or a
fact requires a compatibility decision and a new contract release.

## Canonical Form

FormIndex is strict canonical JSON. Documents sort by path. Forms and controls
sort by source range. JSON uses UTF-8, LF, two-space indentation, and one final
newline. Duplicate or case-colliding document paths, duplicate form ranges, and
duplicate control ranges fail validation.

`parseFormIndex` accepts only the exact output of `serializeFormIndex`. Generic
JSON formatting, comments, duplicate keys, host paths, timestamps, snippets,
AST nodes, callbacks, and runtime handles are rejected.

## Freshness

Before form rules run, the compiler verifies every indexed document against the
current discovery snapshot. It reads each source through the bounded shared
source cache, recomputes the digest, validates UTF-8, and checks every nested
range against the current source text.

A missing source, stale digest, invalid encoding, or out-of-bounds range is a
configuration failure. No form diagnostic or clean result is emitted from stale
or unbound evidence.

## Template Boundary

A feature contract may name a non-HTML template only when the project selects an
external FormIndex. Without `formIndex`, the built-in provider still requires a
`.html` template and rejects other source kinds before parse5 runs.

RuntimeManifest v1 embeds exact static HTML. `compileProject` therefore refuses
to emit a GET page from a non-HTML template even when an external FormIndex made
the structural check pass. A future rendered-page artifact needs its own
source-bound contract rather than copying template source into runtime output.

## Producer Boundary

A producer should depend only on `@0disoft/mensor-contract`, extract facts in a
separate process chosen by the application, and write only
`serializeFormIndex(index)` output. Producer identity describes extraction
semantics but grants no trust. Producer fixtures must independently prove that
the source language was interpreted correctly.

FormIndex authorizes data ingestion, not a plugin lifecycle. Mensor does not
provide package loading, shell execution, callbacks, network access, framework
configuration execution, or dependency installation for producers.
