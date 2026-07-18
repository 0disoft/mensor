# Multi-Project Adoption Cost

- Status: Two-fixture pilot and RouteIndex slice complete
- Evidence date: 2026-07-18
- Targets: `fixtures/valid/hono-static-tasks` and
  `fixtures/valid/node-static-rsvp`
- Measurement command: `pnpm run adoption`

## Decision

The two maintained applications pass Mensor without diagnostics and produce
the expected missing-field and unexpected-field diagnostics after a static
HTML field rename. Before RouteIndex, both also reproduced the same blind spot:
changing only the application route declaration left Mensor green.

That repeated result opened the narrow serialized `RouteIndex` boundary. The
implemented slice now detects a source-only route change as stale index input
and, after index regeneration, emits `route.missing` for the contract
disagreement. This is not evidence for a Hono extractor, a Node source parser,
a generic plugin system, broad framework compatibility, or low-friction
adoption.

## Authoring Cost

The measurement counts physical non-empty lines. Project contracts are fixed
project cost; feature contracts are marginal feature cost. Route indexes are
reported separately because a producer should generate them rather than a
person maintaining their canonical JSON by hand.

| Target | Project contract | Feature contract | Application source | RouteIndex | Total ratio | Feature ratio |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `hono-static-tasks` | 21 | 41 | 99 | 45 | `0.626` | `0.414` |
| `node-static-rsvp` | 21 | 53 | 146 | 45 | `0.507` | `0.363` |

The optional RouteIndex path increased project fixed cost from 20 to 21 lines.
Marginal feature cost remains 41 to 53 lines. The lower feature ratio in the
RSVP project comes from a larger application, not a smaller contract. The
second pilot therefore does not justify calling authoring low friction.

Each maintained index is 45 non-empty lines for two routes. That is acceptable
as generated evidence but expensive as manual authoring. No external producer
exists yet, so current support is an artifact-consumption contract rather than
an ergonomic adapter workflow.

The main repeated authoring cost remains the explicit action schema, form
codec bindings, handler reference, and form-to-route linkage. A convenience
feature may remove a field only when both pilots prove source facts own the
same value. Short syntax that merely hides the same duplicated fact does not
reduce maintenance cost.

## Drift Probes

| Target | Static field rename | Stale route index | Regenerated route index |
| --- | --- | --- | --- |
| `hono-static-tasks` | `form.field_missing`, `form.field_unexpected` | `route_index.digest_mismatch` | `route.missing` |
| `node-static-rsvp` | `form.field_missing`, `form.field_unexpected` | `route_index.digest_mismatch` | `route.missing` |

The Hono probe changes its `POST` route from `/tasks` to `/work-items`. The Node
probe changes its shared request-path match from `/rsvp` to `/responses`. A
source-only mutation invalidates the bound digest. The adoption probe then
regenerates the index against current bytes so the semantic rule can prove
that the declared action route is missing.

There were zero observed diagnostics for the two valid inputs. This is an
observed count, not a false-positive rate. Two synthetic maintained projects
do not represent framework defaults or independently maintained applications.

## RouteIndex Outcome

The implemented route slice preserves these boundaries:

1. The compiler consumes canonical serialized route data and does not execute
   application or framework source.
2. Every indexed route is bound to current source bytes and a source range.
3. Stale evidence fails configuration before semantic diagnostics.
4. Fresh evidence missing an action route emits deterministic `route.missing`.
5. The built-in compiler contains no Hono- or Node-specific route extraction.
6. Adapter lifecycle, arbitrary hooks, dependency installation, and framework
   execution remain out of scope.

`docs/architecture/route-index-v1.md` owns the current wire and trust contract.
A real adapter is a separate trust boundary and requires evidence from an
actual consumer before Mensor claims framework support.

## Reproduction Contract

`scripts/run-adoption-pilot.mjs` owns project, feature, application, and index
line counts; five field-drift latency samples per target; deterministic field
and route mutations; stale-index failure codes; regenerated-index diagnostics;
and expected valid-project results. It fails when any maintained result changes
without this report being revisited.
