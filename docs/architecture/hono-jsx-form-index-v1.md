# Hono JSX FormIndex v1 Implementation Contract

- Status: Bounded parser and explicit CLI producer implemented
- Output boundary: Unchanged FormIndex v1 schema
- Fixtures: `fixtures/contracts/hono-jsx-v1/expectations.json`

## Scope

The internal bounded Hono JSX parser remains explicit and parses source only.
It does not import or execute application modules, HonoX configuration, Vite
plugins or renderers. This contract does not enable TSX in the current compiler.

`@0disoft/mensor-compiler/hono-jsx` exports the source-only
`extractHonoJsxFormDocument` primitive, not a package-root API. It accepts a
relative TSX path and source text, validates portable paths, limits input to
1 MiB and 100,000 AST nodes, and reports invalid encoding or syntax explicitly.
No filesystem discovery, runtime detection or application execution occurs in
that primitive. Its caller owns activation checks; CLI consumers should use
the explicit producer below.

## Explicit CLI Producer

```text
mensor index-hono-jsx-forms . --source app/routes/index.tsx --jsx-config tsconfig.json --build-config vite.config.ts --renderer app/routes/_renderer.tsx --json
```

The Mensor contract can remain at the application root with `sourceRoot:
"app"`. Declare `formIndexEvidence: ["tsconfig.json", "vite.config.ts"]`
alongside `formIndex` to snapshot these configuration files outside `sourceRoot`.
This does not enable root-wide source discovery or make evidence files eligible
as form templates, handlers, routes or module-boundary sources.

The producer requires every input explicitly and uses HonoX's default layout:
`vite.config.ts` and `tsconfig.json` beside `app/`. Select at most 60 TSX routes,
all directly beside `app/routes/_renderer.tsx`. Nested renderer discovery,
route middleware and custom build transforms are not supported. Configuration
must be standalone JSONC with automatic JSX and `jsxImportSource: "hono/jsx"`,
without inheritance, references, path remapping or custom transforms. The Vite
file must directly export `defineConfig` with only the default `honox()` plugin
and explicit automatic Hono JSX esbuild settings. Optional `build` settings
are limited to literal `outDir`, `emptyOutDir` and `ssr` values, plus
`rollupOptions.output` containing literal `entryFileNames`, `chunkFileNames`
and `assetFileNames`. Output callbacks, plugins and other Rollup settings
remain unsupported.

Routes must directly default-export `createRoute` with one synchronous callback
returning `context.render(JSX)`, with no JSX outside that render argument.
The selected renderer must directly export
Hono `jsxRenderer`, returning intrinsic non-form wrappers with exactly one
children slot and no behavioral or dynamic attributes. Conflicting JSX pragmas,
syntax errors and unrecognized activation settings fail before output.

This verifies the explicitly selected source configuration, not the process
that eventually builds or serves the application. It does not attest installed
dependencies, deployment settings, outer application middleware or runtime
behavior. Callers must select their actual build inputs and retain application
semantic tests. No route URL is inferred from filenames.

The renderer, JSX configuration and build configuration are also source-bound
documents with kind `mensor/hono-jsx-activation`, no forms and complete static
inspection. Their exact digests make existing FormIndex freshness checks reject
stale configuration as well as stale TSX. Inputs must be in the consumer's
discovered source tree or its explicit `formIndexEvidence` list. The list accepts
at most 16 unique relative files and requires `formIndex`; each listed file must
have a complete, form-free index document. Missing, undeclared or form-bearing
evidence fails closed. Evidence shares snapshot identity, per-file size,
aggregate file/byte and depth limits with the source tree. Symbolic links remain
forbidden. Empty activation documents are not claims about runtime execution.

Each input is a regular UTF-8 file of at most 1 MiB, without symbolic-link
components. Inputs are reread before serialization to reject changed snapshots.
Output defaults to `mensor.form-index.json`, must be a distinct root-relative
JSON path, and uses the existing atomic writer. Configuration or write failures
preserve an existing artifact. Unsupported form syntax remains incomplete
evidence and may be written successfully; consumers still reject linking it.

The first subset covers intrinsic forms, text/email/radio inputs, boolean
`required` and `disabled`, unnamed submit buttons, labels, fragments and
non-disabled fieldset/legend wrappers. Structural attributes are literal.
Disabled inputs and unnamed buttons are recorded but do not become submitted
fields. Radio controls sharing a name remain one mutually-exclusive field,
with every control preserved. `required` does not infer a validation schema.

Omitted and empty actions produce `current-document`; an explicit literal path
produces known action evidence. The existing feature contract must still name
the current document path. No route is inferred from a HonoX filename.

Dynamic siblings may be ignored only when their visible structure is entirely
intrinsic non-form content and text values are statically bounded. The parser
accepts scalar literals and maps of literal text arrays (inline or non-exported
top-level constants with no other references). Opaque values, helper calls and
externally mutable arrays remain incomplete. This is not blanket
permission to skip siblings: custom components can create external controls,
and a literal `form` attribute can associate an outside control with this form.
Both are unsupported in v1. Expressions inside the form are not evaluated,
including apparently constant structural attribute expressions.

Disabled fieldset inheritance, other input kinds, select/textarea, nested
forms, external association, custom renderers, raw HTML, islands and client
submission semantics are outside this first subset. Add positive and failure
expectations before admitting any of these. Attribute names must be lowercase;
entity-encoded or multiline attribute strings and custom event/HTML insertion
semantics remain unsupported rather than being decoded with guessed rules.
Unrecognized syntax must not
silently become a complete empty document.

## Unsupported Evidence

Activation errors distinguish `hono_jsx.configuration_unsupported`,
`hono_jsx.build_plugin_unsupported`, `hono_jsx.build_settings_unsupported`,
`hono_jsx.runtime_mismatch` and `hono_jsx.route_prelude_unsupported`.
When a source AST node is available, the message includes its one-based line
and column; the failure's `file` remains root-relative. Other unrecognized
activation shapes retain `hono_jsx.activation_invalid`.

Emit one incomplete document, an offending source range and no forms. Partial
form extraction is deferred. Existing consumers reject a linked incomplete
document with `form_index.inspection_incomplete`.

| Fixture | Existing FormIndex reason |
| --- | --- |
| `computed-attribute`, `spread-attribute` | `computed-attribute` |
| `conditional-control` | `conditional-presence` |
| `repeated-control` | `repeated-generation` |
| `custom-component`, `custom-sibling` | `custom-helper-semantics` |
| `external-association` | `unsupported-control-kind` |
| `file-input` | `file-input` |
| `named-submitter` | `named-submitter` |
| `route-override` | `submitter-route-override` |

For a repeated or conditional subtree, use its outer expression range rather
than a computed attribute inside it. For separate offending constructs, choose
the first in source order. Malformed source, invalid paths, resource limits and
unverified renderer activation remain explicit failures, never complete indices.

## Source And Canonicalization

- Use project-relative POSIX paths and SHA-256 of the exact UTF-8 source bytes.
- Reserve `mensor/hono-jsx` for the producer name and source kind. Fixtures use
  `0.0.0-fixture`, not a package release version.
- Ranges are zero-based UTF-16 line/character pairs with exclusive ends.
  Forms and controls use opening-element ranges, including self-closing tags.
- Explicit identity, method, action, name and type evidence uses its attribute
  range. Omitted actions and inferred boolean/multiplicity facts use the opening
  element. Explicit empty actions retain their attribute range.
- Preserve canonical FormIndex ordering and encoding. Input order and absolute
  checkout location must not change bytes. Do not emit host paths, timestamps,
  AST nodes, expressions or raw source.
- Preserve discovery, digest and range verification. Even a whitespace-only
  source edit invalidates an earlier index.

## Current Evidence

`packages/compiler/test/hono-jsx-contract.test.mjs` compares actual parser output
against all hand-authored expectations and checks the public schema, serializer, freshness checker
and semantic consumer. Supported ranges must match actual TypeScript JSX opening
nodes; a supplementary Unicode case distinguishes UTF-16 from code points.
Copies under two physical roots exercise canonical bytes, discovery rejection,
stale-source rejection and invalid ranges.

Both physical roots run actual extraction and must produce the same canonical
bytes as the expected artifact. Additional cases reject opaque/repeated sibling
content, malformed and oversized source, unsupported attributes and nested forms,
and prove that application statements are not executed. Normal compiler test
discovery includes these tests. They do not prove renderer activation or CLI use.

`packages/cli/test/hono-jsx-form-index.test.mjs` separately checks CLI output,
activation rejection, stale configuration, source limits, unsafe paths,
incomplete forms and preservation of existing output.

## Separate Gates

The fixture contract and unchanged serialized boundary permit parser-level
implementation using the existing TypeScript dependency. CLI exposure adds
explicit source selection, selected Hono JSX/build and renderer validation,
malformed source handling, path/size bounds and atomic output. Import spelling
alone does not prove the runtime selected by a project's JSX/build configuration.

Independent-agent provenance, exact model identity and access attestation govern
agent-evaluation claims, not deterministic parser correctness. Keep the local
trial's provenance limitations and never relabel it as attested. This removes
an irrelevant implementation blocker without weakening source-execution,
freshness, unsupported-syntax or renderer-activation boundaries.
