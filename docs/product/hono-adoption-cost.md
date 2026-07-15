# Hono Adoption Cost

- Status: One-fixture pilot complete
- Evidence date: 2026-07-15
- Target: `fixtures/valid/hono-static-tasks`
- Measurement command: `pnpm run adoption`

## Decision

The current static HTML boundary can check a runnable Hono application without
executing Hono during compilation. That is enough to continue experiments, but
not enough to claim general Hono support. Contract authoring cost is high for a
small feature, and framework route declarations remain outside the compiler's
fact graph.

Do not build a Hono-specific extractor or generic plugin system from this one
synthetic fixture. The follow-up SonicJS study found that a real Hono CMS owns
its forms in TypeScript templates rather than static HTML; see
`docs/product/sonicjs-adoption-study.md`.

## Authoring Cost

The script counts physical, non-empty lines. It does not attempt to assign
subjective complexity weights.

| Surface | Files | Non-empty lines |
| --- | ---: | ---: |
| Project and feature contracts | 2 | 61 |
| Feature contract only | 1 | 41 |
| Application source | 6 | 99 |

The total contract-to-application line ratio is `0.616`. The project contract
accounts for 20 of the 61 contract lines and is reusable across features, so the
ratio exaggerates marginal cost for larger projects. Even after removing that
fixed overhead, the feature contract alone is 41 non-empty lines for 99 lines of
application source. Most of that cost describes the schema, form codec, handler,
and form-to-action linkage that source facts cannot currently prove.

This is too expensive to call low-friction adoption. A second pilot should
report both project-level fixed cost and per-feature marginal cost instead of
publishing one blended ratio.

## Drift Probe

| Probe | Result | Local timing |
| --- | --- | ---: |
| Valid fixture | 0 diagnostics | 124.065 ms |
| Rename HTML field `title` to `summary` | `form.field_missing`, `form.field_unexpected` | 59.083 ms median |
| Change Hono POST route `/tasks` to `/work-items` | 0 diagnostics | 48.637 ms |

The field-drift timing uses five samples: 33.544 ms minimum, 59.083 ms median,
and 91.463 ms maximum. These values are local developer-loop observations, not
portable latency budgets.

The valid fixture produced no diagnostics, but one synthetic fixture cannot
establish a false-positive rate. The only supported statement is an observed
false-positive count of zero for this input.

The route probe exposes a real blind spot. Mensor compares static HTML facts to
the declared action route, but it does not extract Hono route declarations. A
source-only change to the POST route therefore leaves the compiler green while
the application behavior and contract diverge. The runnable semantic test is
currently the only guard for that drift.

## Maintenance Cost

The `/tasks` route literal occurs twice in the feature contract and three times
in the Hono route source. A complete route rename therefore touches five
literal sites across two ownership surfaces. An omitted HTML action avoids a
sixth copy, but `form.documentPath` and `action.route.path` remain distinct
contract facts because the compiler cannot infer page ownership from Hono.

Removing one contract copy by borrowing the expected action path would hide
page-route drift and is not acceptable. The defensible future boundary is a
serializable route index produced by an explicit framework adapter or host
integration, not execution of Hono configuration or application modules.

## Product Consequences

1. Keep static HTML Hono compatibility experimental.
2. Treat the independently maintained SonicJS study's `0/92` input eligibility
   as evidence that static HTML is not a representative Hono default.
3. Treat per-feature contract lines as a primary adoption metric.
4. Preserve semantic application tests because the compiler does not yet own
   framework route facts.
5. Explore a narrow serialized `RouteIndex` only after a second application
   reproduces the route-drift problem.
6. Do not report a false-positive rate until the corpus contains multiple
   independently authored valid projects.

## Reproduction Contract

`scripts/run-adoption-pilot.mjs` owns file selection, non-empty line counting,
five diagnostic-latency samples, deterministic mutations, and expected
diagnostic codes. It fails if the valid fixture emits diagnostics, field drift
is not detected, or the known route-drift boundary changes without this report
being revisited.
