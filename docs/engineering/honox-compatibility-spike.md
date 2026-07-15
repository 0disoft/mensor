# HonoX Compatibility Spike

- Status: Static HTML pilot complete; JSX extraction deferred
- Evidence date: 2026-07-15
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
| omitted form action | Model gap | The current empty string loses the HTML meaning of submitting to the current document URL. |
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

`fixtures/valid/hono-static-tasks` is a runnable Hono `4.12.30` application,
not a HonoX or JSX extractor fixture. Hono owns request routing and response
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

## Decision

- **Applied:** retain this compatibility map, the corrected action model, and
  the runnable static HTML Hono fixture.
- **Defer:** Hono JSX intrinsic extraction until an independently maintained
  application is available.
- **Reject:** generic TSX traversal, BYOR support, HonoX config execution, Vite
  plugin loading, schema inference from TypeScript generics, and component
  rendering inside the compiler.
- **Research next:** find one maintained HonoX application with a progressively
  enhanced URL-encoded form and a semantic test. Do not count the framework
  documentation example as external adoption evidence.

## Implementation Gate

Implementation may start only when all of the following exist:

- one independently maintained HonoX application that opts into the experiment;
- synthetic pass and explicit-unsupported fixtures that do not copy upstream
  application code;
- canonical output and cross-root determinism expectations; and
- a package and dependency plan that does not introduce HonoX, Vite, Babel, or
  a renderer runtime into the compiler.
