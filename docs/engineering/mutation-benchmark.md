# Mutation Benchmark

- Status: Active
- Owner: Maintainer

## Purpose

The mutation benchmark measures whether deterministic source mutations produce
their declared diagnostic codes. It is a detection benchmark, not evidence
that a coding agent repaired the mutation.

Run it through the configured `mensor_benchmark` intent. The command emits one
canonical JSON document containing mutation IDs, expected and actual diagnostic
codes, root-relative changed files, and SHA-256 digests of source state before
and after mutation. It emits no source text, absolute path, timestamp, agent
prompt, or transcript.

## Current Golden Corpus

The golden corpus contains seventeen deterministic mutations derived from three
valid baselines. `tiny-tasks` owns synthetic form and handler mutations.
`layered-tasks` owns browser, shared, route, database, test, and i18n boundary
mutations. `dogfood-tasks` contributes a missing-field mutation against a
runnable server-rendered application:

- form action mismatch;
- form control and codec mismatch;
- missing form field;
- unexpected form field;
- form method mismatch;
- missing handler export;
- direct and transitive browser-to-server imports;
- a computed browser dynamic import;
- a direct route-to-database import;
- a test moved outside its owned slot; and
- an i18n file moved outside every feature.
- a required field removed from the runnable dogfood form.
- a browser CommonJS import reaching a server module;
- a runtime handler replaced by a type-only declaration;
- a required control disabled through fieldset inheritance; and
- duplicate successful controls bound to one scalar field.

Every mutation identifies its baseline, must produce exactly its declared
diagnostic set, and must be byte-identical when applied under different
absolute roots. Golden cases gate regressions and must remain deterministic.
Real agent failures belong in a separate dirty corpus until reviewed and
stabilized.

## Metric Boundary

`detectionPassedCount / caseCount` measures deterministic detection coverage.
It is not `pass@k`, `pass^k`, repair rate, semantic preservation rate, or safe
trajectory rate. The private trial protocol can record those final-state checks
with fake adapters, but real metrics still require repeated provider trials and
explicit tool, environment, cost, and approval policy.

This command does not measure compiler throughput. Cold-run time, repeated
process time, file and byte counts, parsing time, and peak RSS require a
separate performance report over reviewed agent-authored dogfood projects
before any performance threshold is adopted.
