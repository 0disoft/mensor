# Multi-Project Adoption Cost

- Status: Two-fixture pilot complete
- Evidence date: 2026-07-18
- Targets: `fixtures/valid/hono-static-tasks` and
  `fixtures/valid/node-static-rsvp`
- Measurement command: `pnpm run adoption`

## Decision

The two maintained applications both pass Mensor without diagnostics and both
produce the expected missing-field and unexpected-field diagnostics after a
static HTML field rename. They also reproduce the same blind spot: changing
only the application route declaration leaves Mensor green.

This is enough evidence to design a narrow serialized `RouteIndex` boundary.
It is not evidence for a Hono extractor, a Node source parser, a generic plugin
system, broad framework compatibility, or low-friction adoption.

## Authoring Cost

The measurement counts physical non-empty lines. Project contracts are treated
as fixed project cost; each feature contract is treated as marginal feature
cost.

| Target | Project contract | Feature contract | Application source | Total ratio | Feature ratio |
| --- | ---: | ---: | ---: | ---: | ---: |
| `hono-static-tasks` | 20 | 41 | 99 | `0.616` | `0.414` |
| `node-static-rsvp` | 20 | 53 | 146 | `0.500` | `0.363` |

The project-level fixed cost was 20 lines in both samples. Marginal feature
cost ranged from 41 to 53 lines. The lower feature ratio in the RSVP project
comes from a larger application, not a smaller contract. The second pilot
therefore does not justify calling authoring low friction.

The main repeated authoring cost remains the explicit action schema, form
codec bindings, handler reference, and form-to-route linkage. A future
convenience feature may remove a field only when both pilots prove that source
facts own the same value. Short syntax that merely hides the same duplicated
fact does not reduce maintenance cost.

## Drift Probes

| Target | Static field rename | Application route rename |
| --- | --- | --- |
| `hono-static-tasks` | `form.field_missing`, `form.field_unexpected` | 0 diagnostics |
| `node-static-rsvp` | `form.field_missing`, `form.field_unexpected` | 0 diagnostics |

The Hono probe changes its `POST` route from `/tasks` to `/work-items`. The Node
probe changes its request-path match from `/rsvp` to `/responses`. Both changes
break the runtime route while leaving the feature contract and static form
unchanged. Mensor cannot detect either mutation because application route facts
are not currently part of its semantic project.

There were zero observed diagnostics for the two valid inputs. This is an
observed count, not a false-positive rate. Two synthetic maintained projects
do not represent framework defaults or independently maintained applications.

## RouteIndex Gate

The next route slice must keep these boundaries:

1. The compiler consumes a canonical serialized route index; it does not
   execute application or framework source.
2. Every indexed route is bound to source bytes and a source range.
3. The initial rule compares declared page and action routes with indexed
   application routes and emits deterministic diagnostics for missing or
   mismatched facts.
4. The built-in compiler does not grow Hono- or Node-specific route extraction.
5. Adapter lifecycle, arbitrary hooks, dependency installation, and framework
   execution remain out of scope.

The first implementation may use maintained index files in fixtures. A real
adapter is a separate trust boundary and requires evidence from an actual
consumer before it becomes public surface.

## Reproduction Contract

`scripts/run-adoption-pilot.mjs` owns project and feature line counts, five
field-drift latency samples per target, deterministic field and route
mutations, and expected diagnostic codes. It fails when a valid project emits
diagnostics, a field drift is not detected, or either known route-drift result
changes without revisiting this report.
