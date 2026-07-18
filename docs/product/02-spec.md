# Product Specification

- Status: Proposed
- Owner: Maintainer

## Product Contract

Mensor checks declared project contracts against facts extracted from a local
source tree. Contract failures are normal results, not internal exceptions.
The tool is deterministic, offline, and safe to run against an untrusted pull
request within the documented resource limits.

## MVP Input Boundary

- TypeScript and JavaScript source
- Static `.html` files
- One root-relative `mensor.project.jsonc` contract
- Static GET page and POST action declarations
- `application/x-www-form-urlencoded` form semantics
- A Mensor-owned, serializable schema subset
- File-level feature ownership and architectural roles

The compiler must not import source modules, execute configuration, spawn a
framework CLI, install packages, or access the network.

An action form template must end in `.html`. Contract validation rejects other
source kinds before HTML extraction so TypeScript template strings cannot be
misclassified as static documents.

## Contract Authoring Rule

Source facts that can be extracted reliably must not be repeated in the project
contract. HTML owns form method, action, controls, and source positions.
TypeScript owns imports and exported symbols. The project contract owns facts
that source alone cannot prove, including feature identity, architectural role,
form-to-action linkage, field decoding, and enforced boundaries.

The current machine-readable contract is defined by
`packages/contract/spec/project-contract-v1.schema.json`,
`packages/contract/spec/feature-contract-v1.schema.json`, and
`packages/contract/spec/diagnostic-report-v1.schema.json`. The valid and invalid reference inputs
live under `fixtures/`.

## First Vertical Slice

The first implementation proves the project-structure pipeline before template
parsing is introduced:

```text
project contract
  -> deterministic discovery
  -> feature contract
  -> action handler linkage
  -> file-role classification
  -> file.role_mismatch diagnostic
  -> deterministic diagnostic report
```

The project contract declares non-overlapping feature-relative directories for
architectural roles. An action handler declares its source file, export name,
and expected role. The compiler reports a placement error when the discovered
file belongs to another role or no role. It parses the handler source without
executing it and reports a missing explicit named export. Wildcard re-exports
fail closed because their target cannot be proven without module resolution.

The second vertical slice connects one static HTML form to one action contract.
It extracts form identity, method, action, source range, and named field
candidates, then detects:

- a required action field has no matching form control;
- a named form control is neither bound nor explicitly ignored;
- form method does not match the linked action method; and
- form action does not match the linked action path; and
- checkbox or repeated select semantics are connected to the scalar text
  decoder.

Repeated radio controls with one form and wire name are one mutually exclusive
scalar field, not duplicate scalar values. Inert form or control markup inside
`template` content is excluded from the static document facts. Supporting
client-side cloning of that content requires a separate explicit contract.

Additional decoder families remain separate slices and are supported only when
their serializable schema and form semantics are defined.

For form comparison, the compiler normalizes an HTML form method to ASCII uppercase
and treats an omitted method as `GET`. A non-empty action must be a static,
root-relative path without a query or fragment. An omitted or empty action is a
`current-document` fact, not an empty route. Its action form contract must
declare the static root-relative `documentPath` that owns the template; semantic
linking resolves that path before comparing it with the POST action route.
Mismatch facts distinguish `literal` from `current-document` action sources.
URL resolution beyond the current document, route parameters, named submitters,
and per-button method or action overrides are unsupported and must produce an
explicit diagnostic when encountered.
Named file inputs are also explicit unsupported controls because multipart
transport is outside the MVP.

## MVP Rule Families

The normalized TypeScript fact pipeline enforces configured direct and
transitive import boundaries. A browser role can forbid transitively reachable
server roles, while a route role can forbid only direct imports of database or
internal roles. Type-only imports remain architectural edges. Non-literal
dynamic imports reached by a boundary fail explicitly. No-substitution template
literals are static import targets. Calls to a lexically bound local `require`
or `require.resolve` are not CommonJS module edges.

Project-owned ownership rules match explicit suffixes and require test or
translation files to live under a declared slot inside their feature. Matching
files outside every feature are reported as unowned rather than assigned by a
filename guess.

Import and ownership policies are configurable project contracts, not universal
opinions baked into the compiler.

## Form Codec

HTML form input is a string multimap, not typed JSON. The contract must state
how a raw field becomes an action value. The first schema revision supports an
object containing string fields decoded by the text codec. Base-10 integer,
finite decimal, checkbox, enum, and repeated scalar codecs are planned
extensions and become supported only when their schemas and fixtures land.

The codec distinguishes a missing field from an empty string, rejects duplicate
scalar values, and rejects unknown fields unless they are explicitly listed as
host-consumed fields such as a CSRF token. Bracketed names are exact wire names;
nested object paths require an explicit binding.

Files, arbitrary transforms, recursive schemas, unions, regular-expression
refinements, and multipart bodies are outside the MVP.

## Diagnostic Contract

Each diagnostic contains:

- stable semantic `code`, `severity`, and `category`;
- project-relative POSIX `file` and a 0-based UTF-16 `range`;
- a human-readable `message`;
- code-specific serializable `facts`;
- zero or more `related` source locations; and
- a `repair` object with a strategy, hint, and constraints that must be
  preserved.

Diagnostic codes use brand-neutral semantic names such as
`form.field_missing`. Numeric or brand-prefixed codes are deferred until real
fixtures prove that they add value. A published code is never reused for a
different meaning.

## Deterministic Output

For identical source bytes, contract bytes, and tool version, JSON output must
be byte-identical. Canonical output uses relative `/` paths, LF newlines, stable
object and list ordering, two-space indentation, and one final newline.

Canonical output excludes absolute paths, timestamps, durations, random IDs,
hostnames, usernames, environment values, progress messages, and source
snippets. Debug information belongs on an explicitly non-canonical stderr path.

## MVP Acceptance

1. A valid placement fixture returns no error diagnostic.
2. A misplaced handler emits exactly the expected `file.role_mismatch` diagnostic.
3. Running a fixture from different absolute roots produces identical JSON.
4. Directory entries are sorted before recursive discovery.
5. A source module with an import-time sentinel is never executed.
6. Discovery fails closed at its configured file-count limit.
7. Contract and template reads fail closed at the configured byte limit.
8. A missing required form field emits the exact canonical
   `form.field_missing` diagnostic from different absolute roots.
9. An unknown named form field emits one exact canonical
   `form.field_unexpected` diagnostic per wire field name, even when multiple
   controls share that name.
10. A repair benchmark requires both a passing check and an unchanged semantic
   application test; protected contracts retain their baseline digests, so
   contract weakening is a failed repair.
11. Form method and action mismatches emit separate exact diagnostics at the
    corresponding HTML attributes with the declared route as a related location.
12. A checkbox or `select[multiple]` bound to the scalar text decoder emits
    `form.control_codec_mismatch` at the incompatible control.
13. `mensor check --json` writes one JSON document and one LF to stdout and
    maps clean, diagnostic, configuration, and internal outcomes to exit codes
    `0`, `1`, `2`, and `3` without stdout contamination.
14. Named file inputs, named submitters, and submitter route overrides emit
    `form.control_unsupported` instead of disappearing from analysis.
15. A declared handler export missing from its source emits
    `handler.export_missing` without importing or executing that module.
16. Direct and transitive import boundaries emit exact
    `module.boundary_violation` diagnostics with a deterministic import chain.
17. A boundary-reachable non-literal dynamic import emits
    `module.dynamic_import_unsupported` instead of reducing graph coverage.
18. Test and i18n suffix rules emit `file.ownership_mismatch` for both a wrong
    feature slot and a file outside every declared feature.
19. An agent repair command receives the validated failing diagnostic report,
    including facts and repair constraints, through bounded stdin. Report/code
    drift, passing reports, malformed reports, and oversized input fail before
    command execution.
20. Authoritative command-trial evidence derives the adapter, execution
    descriptor, report, and fingerprint from one command configuration. Invalid
    execution configuration fails before mutation.
21. Handler exports must exist in the runtime value namespace; type-only and
    ambient declarations do not satisfy executable handler contracts.
22. Active boundaries analyze literal ESM and CommonJS module edges, reject
    computed runtime targets, and classify nested files against their longest
    declared feature root.
23. Static form facts implement disabled-fieldset submission semantics and
    reject repeated successful controls for scalar text bindings.
24. Feature and diagnostic-report parsers reject cross-field contradictions in
    binding ownership, summary counts, status, and source ranges.
25. Mutating evaluation APIs reject concurrent use of one workspace, attribute
    agent changes before semantic evaluation, and revalidate the post-oracle
    final state.
26. Repeated command-agent evaluation validates its complete case plan before
    creating mutable state, uses one fresh workspace per attempt, disposes that
    workspace on every outcome, and merges only matching execution cohorts.
27. Evaluation snapshots use streaming hashes and explicit file, byte,
    aggregate-byte, and depth limits; exceeding a limit fails closed.
28. Execution fingerprints commit to the validated executable, arguments,
    environment, and process limits without serializing their raw values.
29. Package validation starts from clean build output and rejects generated
    files that do not map to the current source and schema graph.
30. Controlled evaluation baselines are pinned by canonical workspace digest;
    symlinks, special files, source drift, copy drift, and foreign cleanup paths
    fail closed.
31. A runnable server-rendered dogfood application independently passes the
    compiler, GET/POST semantic tests, malformed-form rejection, and HTML
    escaping, and contributes a dedicated mutation baseline.
32. Local command evidence derives a canonical claim assessment that blocks
    public repair-rate eligibility until filesystem, process, network, and
    credential enforcement are independently attested.
33. A future container adapter starts from a canonical networkless Docker plan
    with immutable images, non-root execution, one workspace mount, read-only
    root, dropped capabilities, and bounded CPU, memory, PID, I/O, and time.
34. The private agent runner can bind one Docker sandbox plan to a canonical
    runtime attestation only when normalized engine, image, mount, security,
    credential, temporary-filesystem, and resource observations match that
    plan. This structure alone is not trusted execution evidence.
35. Docker sandbox orchestration uses one fixed validate, create, inspect,
    attest, start, and cleanup workflow. It starts only after inspection passes,
    attempts bounded cleanup after every successful create, and does not treat
    static or fake-port evidence alone as executed sandbox evidence.
36. Docker execution ports can be checked with one immutable probe across
    success, timeout, output-limit, and nonzero-exit cases. The canonical report
    records digests and derived outcomes without claiming independent Docker
    daemon verification.
37. Execution descriptor v2 binds the Docker plan, runtime attestation, and port
    conformance report into one fingerprinted cohort while explicitly retaining
    a port-conformance-only evidence level and no public repair-rate eligibility.
38. Portable Docker plan commitments retain immutable execution and isolation
    facts while replacing the absolute host executable path and raw agent
    arguments with separate SHA-256 commitments. Any path or argument drift
    changes the plan digest without copying those values into evidence.
39. Trial evidence v2 embeds one descriptor, publish-safe plan commitment,
    runtime attestation, port-conformance report, and canonical trial report.
    Parsing rejects fingerprint, attested-limit, base-plan, case-plan, adapter,
    collector, or cohort drift without claiming the report was atomically
    produced by that sandbox.
40. The authoritative sandbox trial runner validates static inputs before
    mutation, owns sandbox execution through final-state report and evidence
    construction, and returns either canonical evidence or a redacted staged
    failure. Cleanup and binding failures cannot produce partial evidence, and
    evidence success remains distinct from repair success.
41. Sandbox evidence assessment validates every v2 artifact binding while
    refusing to infer atomic-constructor provenance from portable JSON. It
    keeps public repair-rate eligibility false until constructor provenance,
    credential scope, Docker daemon fidelity, and runtime observations are
    independently attested.
42. The private Docker CLI execution port creates containers with no implicit
    image pull, explicit isolation limits, and unpredictable ownership labels;
    validates normalized daemon inspection before start; rechecks ownership
    before deletion; and uses a bounded, abortable, explicit-environment process
    boundary. Fake-port and subprocess tests do not count as real-daemon
    evidence.
43. A dedicated Docker integration gate explicitly preloads one digest-pinned
    public probe image, executes success, timeout, output-limit, and nonzero-exit
    paths against a real daemon, and independently requires zero Mensor-owned
    containers before and after every case. Passing this gate proves only the
    tested daemon path, not independent provenance or an LLM repair rate.
44. The first agent-authored build harness validates pinned brief and document
    inputs before creating a fresh workspace, protects supplied input, allows
    generation only under the project boundary, runs independent semantic and
    Mensor checks, records each port's stated isolation without upgrading it,
    and disposes the workspace on success and failure.
45. Every agent-authored result records a canonical runner, provider, exact
    model, reasoning effort, and cohort identity. The first Codex subagent
    cohort pins GLM 5.2, Kimi K2.7, MiniMax M3, and DeepSeek V4 Flash; an
    unavailable model is recorded without substitution and every model result
    remains separate.
46. A host-native subagent result that lacks enforced workspace and repository
    isolation can be retained only as an `exploratory-only` observation. Its
    schema fixes all isolation claims to not enforced and retains only baseline
    commit, model identity, brief digest, generated paths, semantic outcome,
    and Mensor diagnostic codes.
47. Agent-authored tests cannot certify agent-authored behavior. The current
    guestbook trial copies a versioned semantic oracle into protected input,
    records its digest, and runs it against the required `src/app.mjs`
    Request/Response interface after generation.
48. A model-generated project may cross the provider boundary as a bounded
    response artifact. The evaluator validates the complete JSON file map and
    materializes it into a real empty project root; model-authored filesystem
    operations are not the trusted write boundary.
49. Exploratory response observations bind the application brief, semantic
    oracle, and output transport digests. They record artifact acceptance as a
    separate final-state gate and fix tool control to `not-enforced` when the
    host exposes tools despite a prompt-only prohibition.
50. Replayable response observations bind the exact model response bytes. A
    semantic-oracle revision is a behavior migration: old green results must be
    replayed or downgraded, not silently carried forward under the new oracle.
51. The local adoption pilot separates project-level fixed contract cost from
    feature-level marginal contract cost across the maintained Hono task and
    dependency-free Node RSVP applications. Both valid projects remain green,
    both static field mutations produce the expected diagnostics, and both
    application-only route mutations were initially undetected. This repeated
    blind spot opened the design gate for a serialized `RouteIndex`; it did not
    authorize framework execution, a generic plugin API, or a framework-specific
    extractor.
52. The optional project `routeIndex` selects a canonical RouteIndex v1 artifact
    containing static GET/POST paths, source files, SHA-256 digests, and UTF-16
    ranges. The compiler validates freshness before semantic rules. Stale input
    fails with a `route_index.*` configuration failure, while a fresh index
    missing an action's exact route emits `route.missing`. The compiler never
    executes or discovers an index producer.

## Next Product Validation Gate

The repeated evaluator-owned `rsvp-v2` response run is complete. Its two
materialized, Mensor-clean projects both failed the independent semantic oracle,
which confirms that runtime application tests remain a separate required gate.
The next milestone is a release-candidate audit of the packaged first-contract
journey, public limitations, and migration/version surfaces. The narrow
RouteIndex slice returns to product validation only when a real consumer needs
an index producer. External maintainer recruitment and another agent
attestation layer remain out of scope. Future coding-agent trials must continue
to receive a fresh application brief and maintained public documentation
without access to existing fixtures or evaluator-owned semantic oracles.

`docs/product/agent-authored-dogfood-protocol.md` owns the input, output,
evaluation, privacy, security, and stop rules. These trials measure whether an
agent can learn and apply Mensor from its documented contract. They do not
claim external adoption, human authoring ergonomics, market demand, or general
framework compatibility.

The maintained local vertical slice uses the versioned `guestbook-v2` brief,
an injected fake agent, a protected process-only Node semantic-oracle port, and
the real Mensor compiler port. It proves harness control flow and oracle
separation, not model quality, provider compatibility, network isolation, or
sandbox enforcement. The current provider-backed cohort is versioned as
`codex-subagents-v2`; version 1 is retained as historical protocol evidence. A
host-native subagent run remains exploratory until workspace and repository
visibility are enforced rather than requested only through prompt text.

The bounded candidate search recorded in
`docs/product/external-static-html-candidate-search.md` found no application
that met the current native static HTML and TypeScript server-handler boundary.
External recruitment is not planned. Do not substitute frontend-only forms,
usage demos, dynamic framework templates, multipart forms, or client-mediated
JSON requests as product adoption evidence. ADR-0030 selects a serialized `FormIndex` as the template-fact
boundary while retaining static HTML as the only implemented provider. The
byte-preserving internal refactor is complete: the built-in provider
serializes, validates, source-binds, and hands index facts to semantic rules
without changing the maintained diagnostic reports. This does not claim
dynamic template compatibility or authorize an external extractor.

The private `FormIndex` types, validator, canonical serializer/parser, source
digest and range binding, built-in provider, and semantic translator remain
compiler internals. They are not public exports or CLI inputs.

ADR-0033 owns the public RouteIndex boundary. Unlike FormIndex, RouteIndex has a
public schema, parser, serializer, and project-contract input. This accepts
data, not executable adapter authority. Hono- and Node-specific extraction
remain outside the compiler and are not implemented product claims.

`docs/product/multi-project-adoption-cost.md` owns the current authoring-cost
and route-drift evidence. The project-contract fixed cost is measured separately
from each feature contract. Two valid maintained projects have zero observed
diagnostics, but that count is not a false-positive rate or external adoption
claim.

Compiler performance claims remain local engineering baselines until the
agent-authored corpus includes representative project shapes. Performance
reports must distinguish first and repeated process runs, file and byte counts,
parse time, and peak RSS. The mutation benchmark remains a detection benchmark
and cannot stand in for throughput evidence.

## Deferred Decisions

- Agent repair-rate claims and new evidence infrastructure: the private
  provider-neutral protocol records final
  state, protected-contract integrity, semantic tests, and changed-file
  evidence with fake adapters. Claims remain deferred until real providers run
  repeated controlled trials with an explicit trajectory policy. Do not add
  another attestation or eligibility layer before the first agent-authored
  build trial.

- Runtime manifest and reference runtime: add only if a real consumer needs a
  compiled artifact beyond diagnostics.
- Dynamic template adapters: the built-in provider now preserves byte-identical
  diagnostics through `FormIndex`, but external extractors remain deferred
  until one separately approved agent-authored template trial and trust
  boundary exist.
- IDE, SARIF, watch mode, caching, and cloud services: post-MVP integrations.
- Public diagnostic compatibility: begins with the first published preview,
  not with private pre-implementation drafts.
