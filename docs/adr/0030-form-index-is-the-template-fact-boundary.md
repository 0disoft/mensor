# ADR-0030: FormIndex Is the Template-Fact Boundary

- Status: Accepted
- Owner: Maintainer

## Context

Mensor rules currently consume private form facts extracted directly from
static HTML. That path is deterministic and tested, but the external adoption
search found no independently maintained application that combined native
static HTML forms with repository-owned TypeScript server handlers inside the
current transport boundary. SonicJS instead contained 92 observed forms in
TypeScript or TSX source, and the bounded follow-up search rejected every
shortlisted static HTML repository for lacking a matching server handler,
using multipart, or replacing native submission with client JSON.

Adding framework traversal directly to compiler rules would bind diagnostics
to parser-specific objects and encourage one-off extractors. Keeping the
current internal shape unchanged would make every future template source a
compiler-wide refactor. A generic plugin system would introduce execution and
lifecycle authority before any adapter contract has been proven.

## Decision

Mensor owns a versioned, serializable `FormIndex` as the sole boundary between
template extraction and semantic form rules.

- The existing parse5 extractor becomes the first built-in provider.
- Static HTML remains the only implemented provider until the index boundary
  preserves current diagnostics byte-for-byte.
- Rules consume Mensor-owned index values, never parse5 nodes, TypeScript AST
  nodes, renderer objects, class instances, callbacks, or filesystem handles.
- Every indexed document is bound to a root-relative POSIX path and a SHA-256
  content digest.
- Literal, absent, dynamic, and unsupported evidence remain distinct. Rules
  must not silently treat unresolved evidence as a valid static form.
- Canonical ordering, UTF-16 source ranges, and forbidden host metadata are
  part of the index contract.
- The compiler does not execute or discover external providers. No plugin
  lifecycle, package loading, shell command, network request, or config code is
  authorized by this decision.
- A future extractor may produce a serialized index outside the compiler, but
  accepting that artifact through the CLI or library requires a separate trust,
  validation, freshness, and resource-limit decision.

The first design contract is recorded in
`docs/architecture/form-index-v0.md`. Its `v0` label means the design is not yet
a supported public wire format. The eventual machine-readable schema must use
a positive independent schema revision and does not inherit the package
version.

## Consequences

- Static HTML behavior can remain narrow while compiler rules stop depending
  on one parser implementation.
- Dynamic template support becomes an extraction problem with explicit
  uncertainty instead of framework execution inside the compiler.
- The first implementation slice is an internal refactor, not new framework
  compatibility.
- Existing diagnostic reports and fixtures must remain byte-identical through
  that refactor.
- A serialized boundary adds validation and digest cost, but it prevents hidden
  parser state from crossing rule boundaries.
- External adapter execution remains unavailable until separately approved.

## Alternatives Rejected

### Keep static HTML facts private forever

This is simpler immediately, but the candidate search shows that the current
input style is too rare to serve as the only credible adoption path. It also
makes future extraction changes touch semantic rules directly.

### Add Hono or TSX traversal directly to the compiler

This would optimize for one observed repository before defining uncertainty,
freshness, or parser ownership. It also risks source execution and false
confidence around interpolation and generated controls.

### Add a generic plugin API

No stable provider lifecycle, trust model, or compatibility surface exists.
Arbitrary in-process hooks would violate the compiler's no-source-execution
boundary and create a larger product than the fact contract requires.

## Strongest Counterargument

The index may be an abstraction created before a second provider exists. That
would be architecture theater if the built-in HTML provider cannot move behind
it without preserving exact output, or if no external extractor can later
represent useful facts without turning most forms into `unsupported`.

The decision therefore authorizes only the design and the reversible internal
HTML refactor. It does not authorize a framework extractor.

## Reconsider When

- the built-in provider cannot preserve current diagnostics byte-for-byte;
- a real template source requires facts that cannot be represented without raw
  AST or executable renderer state;
- content digests create measured unacceptable cost; or
- maintainer recruitment demonstrates that native static HTML alone is a
  sufficient product boundary.
