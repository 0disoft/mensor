# FormIndex v0 Design

- Status: Accepted design; not implemented
- Authority: ADR-0030
- Public compatibility: None

## Purpose

`FormIndex` is the serializable handoff from a template extractor to Mensor's
semantic form rules. It preserves what a provider proved, what source location
supports that proof, and what remained dynamic or unsupported. It is not a
rendered DOM, template AST, plugin API, or command protocol.

## Envelope

The conceptual first shape is:

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
  readonly forms: readonly IndexedFormFact[];
}
```

`schemaVersion: 1` is the proposed first serialized revision. The document name
uses `v0` because no schema or public parser exists yet. Package versions and
index schema revisions are independent.

`producer.name` and `producer.version` identify extraction semantics. They do
not authorize execution or imply trust. `sourceKind` is an open namespaced
string such as `mensor/static-html`; consumers must not infer behavior from an
unknown value.

## Evidence Values

Template values must preserve uncertainty:

```ts
type IndexedEvidence<T> =
  | {
      readonly state: "known";
      readonly value: T;
      readonly range: SourceRange;
    }
  | {
      readonly state: "absent";
      readonly range?: SourceRange;
    }
  | {
      readonly state: "dynamic";
      readonly range: SourceRange;
      readonly reason: DynamicReason;
    }
  | {
      readonly state: "unsupported";
      readonly range: SourceRange;
      readonly reason: UnsupportedReason;
    };
```

Reason values are stable identifiers, not source snippets. The first design
reserves these categories:

- dynamic interpolation;
- conditional presence;
- repeated generation;
- computed attribute;
- custom helper semantics;
- unsupported control kind; and
- provider resource limit.

The machine schema must replace those prose labels with stable namespaced codes
before implementation. Unknown codes must fail validation until an explicit
forward-compatibility policy exists.

## Form Facts

```ts
interface IndexedFormFact {
  readonly identity: IndexedEvidence<string>;
  readonly method: IndexedEvidence<"get" | "post">;
  readonly action:
    | IndexedEvidence<string>
    | {
        readonly state: "current-document";
        readonly range: SourceRange;
      };
  readonly range: SourceRange;
  readonly controls: readonly IndexedControlFact[];
}

interface IndexedControlFact {
  readonly owner: IndexedEvidence<string>;
  readonly name: IndexedEvidence<string>;
  readonly controlKind: IndexedEvidence<
    "input" | "select" | "textarea" | "button"
  >;
  readonly inputType: IndexedEvidence<string>;
  readonly multiplicity: IndexedEvidence<
    "scalar" | "repeated" | "mutually-exclusive"
  >;
  readonly successful: IndexedEvidence<boolean>;
  readonly range: SourceRange;
}
```

The final implementation may split unions into more precise objects, but it
must preserve these semantics:

- form identity is not synthesized when an id is absent or dynamic;
- omitted and empty actions remain `current-document` evidence;
- control ownership supports ancestor forms and explicit form references;
- disabled, submitter-only, repeated, and mutually exclusive controls remain
  distinguishable; and
- a dynamic successful-control decision cannot be reported as statically
  present or absent.

Providers may add no arbitrary attribute map. Every new fact requires a
Mensor-owned semantic field and compatibility decision.

## Source Locations

Ranges use zero-based lines and zero-based UTF-16 characters, matching current
diagnostics. Paths are project-root-relative POSIX paths. A range must remain
inside the content identified by its document digest.

An index must not contain:

- absolute paths, hostnames, usernames, working directories, or environment
  values;
- timestamps, random identifiers, durations, or discovery-order metadata;
- raw source snippets, comments, expressions, or template literals;
- parser nodes, AST objects, functions, symbols, or runtime handles; or
- credentials, cookies, request bodies, or network results.

## Canonicalization

- Documents sort by `path`.
- Forms sort by start range, then end range.
- Controls sort by start range, then end range.
- Object keys follow the eventual schema order.
- Reason codes and source kinds use exact case-sensitive strings.
- JSON uses UTF-8, LF, two-space indentation, and one final newline.
- Duplicate document paths, form ranges, or control ranges fail validation.
- A repeated run over byte-identical source with the same provider version must
  produce byte-identical output.

## Freshness and Binding

The compiler recomputes each `contentDigest` from the source bytes it already
discovered before trusting an externally supplied index. Digest mismatch,
missing source, extra root-escaping path, or duplicate path fails before rule
execution. The design does not use a Git commit as freshness proof because
uncommitted source and unrelated commits are valid compiler inputs.

The built-in static HTML provider may construct the same values in memory, but
tests must serialize and parse them to prove the boundary remains JSON-safe.

## Failure Rules

- Invalid envelope or fact shape is a configuration failure.
- Stale digest or missing indexed document is a configuration failure.
- Provider resource exhaustion is explicit unsupported evidence, not an empty
  valid index.
- Dynamic or unsupported facts that affect a linked contract must produce an
  explicit diagnostic before a project can pass.
- An empty forms array is valid only when the provider successfully inspected
  the complete document and found no forms.

Diagnostic codes for index validation and unresolved template evidence are a
separate implementation decision. Existing static HTML diagnostic codes must
not change during the internal refactor.

## Adoption Sequence

1. Define the private TypeScript values and canonical serializer/parser.
2. Move the current parse5 extractor behind the built-in provider.
3. Require existing valid and invalid fixtures to produce byte-identical
   diagnostic reports across different absolute roots.
4. Add explicit malformed, stale-digest, dynamic, and unsupported index
   fixtures.
5. Measure index construction and validation cost in the existing 1k/5k/10k
   performance cases.
6. Only then consider one separately approved TypeScript-template extractor.

No step adds a CLI provider flag, process launcher, package loader, network
access, generic plugin interface, Hono dependency, or renderer execution.

## Exit Criteria for v0

The design can advance to a machine-readable schema only when:

- every current static HTML fact maps without semantic loss;
- diagnostic output remains byte-identical for the maintained fixture corpus;
- malformed and stale indexes fail closed;
- canonical output is cross-root and cross-platform deterministic; and
- the performance report separates extraction, index validation, and rule time.
