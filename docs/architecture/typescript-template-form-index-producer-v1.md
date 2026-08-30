# TypeScript Tagged-Template FormIndex Producer v1

- Status: Implemented
- Authority: ADR-0040
- Output contract: `packages/contract/spec/form-index-v1.schema.json`

`mensor index-ts-forms` converts an explicitly selected TypeScript or
JavaScript source set into one canonical FormIndex v1 artifact. Callers repeat
`--source` for project-relative source paths and `--tag` for JavaScript
identifier names whose tagged templates contain HTML.

The producer parses source but never imports, evaluates, transpiles, or runs
application modules. Every source is a bounded UTF-8 regular file below the
selected root, symbolic-link components are rejected, and file identity is
checked before and after one handle-bound read. The default output is
`mensor.form-index.json`; replacement uses the CLI's same-directory atomic
artifact writer.

## Supported Syntax

The accepted unit is a tagged no-substitution template whose tag is an exact
identifier selected by `--tag`:

```ts
export const view = html`<form id="create-task"></form>`;
```

Multiple selected sources and tags are allowed. Each explicit source must
contain at least one selected template. Static HTML form facts use the same
extractor as the built-in `.html` provider, and their UTF-16 ranges are offset
back into the original TypeScript source.

Interpolated selected templates are not evaluated. They make the complete
source document `inspection.state: "incomplete"` with reason
`dynamic-interpolation`. This preserves evidence but causes compiler semantic
linking to fail closed when the document is used by a feature contract.

## Deliberate Limits

- Tag matching is syntactic identifier matching. It does not resolve imports,
  aliases, or lexical shadowing.
- Member-expression tags, call-expression tags, and untagged strings are not
  selected.
- Escape interpretation and runtime tag transforms are not executed.
- Interpolation is not partially inferred, even when an expression looks
  constant.
- Producer discovery, config hooks, generic plugins, and automatic execution
  by `check` or `compile` are not supported.

These limits keep the artifact source-bound and deterministic. A future
framework producer must remain explicit and emit FormIndex data rather than
receive compiler execution authority.
