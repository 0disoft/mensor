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

The golden corpus contains twelve deterministic mutations derived from two
valid baselines. `tiny-tasks` owns form and handler mutations. `layered-tasks`
owns browser, shared, route, database, test, and i18n boundary mutations:

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

Every mutation identifies its baseline, must produce exactly its declared
diagnostic set, and must be byte-identical when applied under different
absolute roots. Golden cases gate regressions and must remain deterministic.
Real agent failures belong in a separate dirty corpus until reviewed and
stabilized.

## Metric Boundary

`detectionPassedCount / caseCount` measures deterministic detection coverage.
It is not `pass@k`, `pass^k`, repair rate, semantic preservation rate, or safe
trajectory rate. Those metrics require repeated agent trials, final-state
application checks, protected-contract checks, patch evidence, and explicit
tool or approval policy.
