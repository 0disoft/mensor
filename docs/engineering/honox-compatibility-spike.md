# HonoX Compatibility Spike

- Status: Static HTML pilot and local HonoX capability trial complete; JSX extraction deferred
- Evidence date: 2026-09-08
- Decision: Support framework-neutral static HTML integration; defer HonoX JSX extraction

## Question

Can HonoX provide a realistic external dogfood target without turning Mensor
into a framework-specific compiler or weakening its no-source-execution trust
boundary?

## Evidence

The review used the HonoX repository and release pages as primary sources:

- <https://github.com/honojs/honox>
- <https://github.com/honojs/honox/releases/tag/v0.1.59>
- <https://html.spec.whatwg.org/multipage/form-control-infrastructure.html>

The documented basic application renders Hono JSX on the server without client
JavaScript. A route file can export `POST`, render a literal `form`, parse its
body, and optionally validate form input through middleware. HonoX also supports
file-based routing, islands, alternate renderers, and route middleware.

HonoX is still documented as alpha and supports bring-your-own-renderer
configurations. A package-name check therefore cannot prove that one stable JSX
runtime owns the source semantics.

## Current Compatibility

| Surface | Current result | Reason |
| --- | --- | --- |
| `.tsx` parsing | Partial | The TypeScript fact extractor already parses TSX without executing it. |
| `POST` export | Compatible | A named value export can already become a handler export fact. |
| import boundaries | Compatible | Literal TypeScript imports already become normalized module edges. |
| intrinsic form markup | Unsupported | Form extraction currently accepts parsed `.html` documents only. |
| omitted form action | Core support implemented | The current-document fact resolves through explicit documentPath evidence; JSX extraction is still missing. |
| file-based route path | Unsupported | Mensor does not interpret HonoX route filenames or configuration. |
| middleware schema | Intentionally unsupported | Type arguments are not runtime validation, and external schema semantics do not own the Mensor contract. |
| custom JSX components | Unsupported | Their rendered controls cannot be proven without component analysis or execution. |
| alternate renderers | Unsupported | React, Preact, Solid, and other renderer semantics are outside one Hono JSX extractor. |

The official basic example is close to the product problem, but it does not
satisfy the current external-dogfood gate because the accepted input contract is
static HTML. Moving the gate after finding no static-HTML candidate would hide
the adoption problem instead of measuring it.

## Minimum Viable Boundary

A future spike may produce a versioned, serializable form index for the existing
form rules. It must not add a generic plugin lifecycle or execute HonoX, Vite,
application modules, or configuration.

The smallest defensible extractor would:

1. accept only `.tsx` files whose imports statically identify the HonoX route
   factory and the Hono JSX renderer contract;
2. visit only lowercase intrinsic `form`, `input`, `select`, `textarea`,
   `button`, `fieldset`, and `legend` elements;
3. accept only literal structural attributes and standard boolean attributes;
4. require a literal form identifier for contract linkage;
5. preserve an omitted or empty action as `current-document`, rather than
   converting it to an empty path;
6. preserve source ranges as zero-based UTF-16 positions;
7. emit the same Mensor-owned form and control facts consumed by existing pure
   rules; and
8. emit explicit unsupported-template facts instead of silently skipping
   dynamic structure.

The extractor must reject or mark unsupported:

- spread attributes;
- expression-valued `id`, `name`, `method`, `action`, `type`, `form`,
  `formaction`, or `formmethod` attributes;
- controls created by conditionals, loops, arrays, callbacks, or object maps;
- forms or controls hidden behind custom components;
- dynamic route segments or route paths inferred from runtime configuration;
- islands and client event handlers as evidence of server form submission; and
- any renderer that cannot be statically proven to use the supported Hono JSX
  intrinsic semantics.

## Completed Core Correction

The private form fact now distinguishes a literal action path from
`current-document`. Static HTML with an omitted or empty action resolves through
the action form contract's explicit `documentPath` during semantic linking.
Missing page evidence fails configuration instead of borrowing the expected
action route. The Hono JSX extractor remains deferred.

## Runnable Hono Static HTML Pilot

At the original pilot date, `fixtures/valid/hono-static-tasks` used Hono `4.12.30`.
It is not a HonoX or JSX extractor fixture. Hono owns request routing and response
delivery while a static HTML file owns the form markup. The compiler checks the
project without importing Hono or executing application modules. The fixture's
semantic tests separately execute Hono's in-process request API and prove GET,
POST, redirect, duplicate-field rejection, unknown-field rejection, and output
escaping.

This result proves a narrow compatibility statement: a Hono application that
keeps contract-bearing form markup in static HTML can use the current compiler.
It does not prove JSX, HonoX file routing, middleware-schema inference, custom
components, or renderer compatibility. Hono remains a root dev dependency used
only by the runnable fixture and is not part of any published Mensor package.
The measured authoring cost and route-drift gap are recorded in
`docs/product/hono-adoption-cost.md`.
The external SonicJS study in `docs/product/sonicjs-adoption-study.md` confirms
that real Hono server-rendered forms can live entirely in TypeScript templates;
it does not satisfy the separate HonoX opt-in gate below.

## Decision

- **Applied:** retain this compatibility map, the corrected action model, and
  the runnable static HTML Hono fixture.
- **Next:** implement the bounded Hono JSX parser against the accepted
  [fixture contract](../architecture/hono-jsx-form-index-v1.md).
- **Reject:** generic TSX traversal, BYOR support, HonoX config execution, Vite
  plugin loading, schema inference from TypeScript generics, and component
  rendering inside the compiler.
- **Prepared:** the versioned [HonoX RSVP brief](../../internal/agent-runner/briefs/honox-rsvp-v1.md)
  and [protected semantic oracle](../../internal/agent-runner/oracles/honox-rsvp-v1.test.mjs)
  define one original server-rendered application with current-document form
  submission, strict URL-encoded input, escaping, and per-instance state.
- **Executed:** one local, prompt-isolated HonoX RSVP capability trial using
  an isolated locked toolchain. The original candidate passed three of four
  semantic tests; after one unknown-field validation repair, all four passed.
- **Specified:** synthetic supported/unsupported JSX fixtures, canonical source
  ranges and expected artifacts under two physical roots. Actual extractor
  output and CLI renderer activation still require implementation evidence.

## Prepared Trial Evidence

The oracle imports the candidate's `src/app.mjs` adapter only after a reviewed
one-shot build. The adapter must exercise real HonoX routes; source review must
reject a second test-only application or a plain Node/Hono replacement. The
HTTP tests and basic markup assertions cannot prove JSX provenance, actual
HonoX use, full HTML structure, or absence of browser-JavaScript dependencies.
Those are separate source and build-inspection gates.

The maintained oracle self-test uses the existing Node RSVP fixture, not HonoX,
and rejects shared state, incorrect redirects, permissive media-type matching,
and mutation on rejected input. This proves oracle sensitivity only. No HonoX
dependency installation, build, model run, or extractor implementation is
claimed by this preparation.

Before running the trial, record exact dependency/build versions, input and
oracle digests, candidate source/artifact digests, model identity, and actual
isolation limits. Record semantic results separately from Mensor coverage.
Current JSX form checking is unavailable; do not create fake FormIndex evidence
or use this exploratory result as an ordinary all-gates-passing build trial.
The next decision consumes the actual intrinsic elements, literal attributes,
dynamic constructs, and source ranges found in the candidate.

## Implementation Gate

Parser implementation may start against the accepted synthetic fixture
contract, using the existing TypeScript parser and FormIndex boundary. It must
not introduce HonoX, Vite, Babel or a renderer runtime into the compiler.
Completion requires actual output equality, explicit unsupported evidence and
cross-root extraction determinism; current oracle tests alone are not enough.
CLI exposure additionally requires a reviewed renderer-activation and bounded
source/output contract.

Independent-agent provenance is a separate evaluation gate, not a prerequisite
for implementing a deterministic parser. The local trial remains exploratory:
it does not acquire access attestation or an exact model identity through this
policy change. Its historical limitations remain recorded below.

## Local HonoX Capability Result

The [private trial](../../internal/agent-runner/trials/honox-rsvp-v1/README.md)
uses Hono 4.13.7, HonoX 0.1.61 and Vite 7.3.6 with Node 24.18.0 on Windows x64.
Its actual HonoX file routes and Hono JSX renderer build and execute through the
protected HTTP oracle without a development server. The repaired candidate
passes all four semantic tests; the first failure and source hashes are retained
in the [evidence record](../../internal/agent-runner/trials/honox-rsvp-v1/evidence.json).

Five inputs and one submit button use literal attributes inside the form,
including boolean `required`, labels and a fieldset/legend. Dynamic list
rendering is outside the form. The recorded inventory includes zero-based UTF-16
source ranges, not a fabricated FormIndex or a claim that JSX inspection ships.

The author received a fresh context without existing fixture or oracle content.
Tool use was forbidden by prompt, but no OS-level filesystem-access attestation
or exact inherited model identifier was available. This is local capability
evidence, not satisfaction of an independent-generation evaluation gate.
No public dependency, compiler behavior, runtime API or release version changed.
