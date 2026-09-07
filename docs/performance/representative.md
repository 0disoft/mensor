# Representative Compiler Performance

This local engineering probe complements the synthetic 1k/5k/10k file probe.
It generates three application-shaped projects from the maintained static-form
and module-boundary contracts. These are synthetic workloads, not external
adoption evidence or a framework compatibility matrix.

| Shape | Features | Actions per feature | Shared modules per feature |
| --- | ---: | ---: | ---: |
| forms-heavy | 24 | 4 | 8 |
| module-graph | 16 | 2 | 64 |
| mixed | 32 | 3 | 16 |

Every action has a form with text, integer, and checkbox inputs and a server
handler. Shared modules form nested-directory import chains. Direct and
transitive boundaries are both enabled. Regression tests require clean baseline
checks and detect a changed form field.

The configured `mensor_representative_baseline` intent runs three independent
Node processes per shape and stores raw results in
`dist/performance/representative-baseline.json`. Each sample reports elapsed
time, exclusive compiler phase times, CPU time, peak RSS, template count, and a
diagnostic digest. Metadata includes Node, OS, architecture, CPU, commit, and
working-tree dirty state. The probe does not flush the OS filesystem cache.

Three samples support a median and range, not a useful p95/p99 claim. Run only
one local measurement lane at a time and treat unrelated host load as a source
of variance. The existing ordinary CI smoke stays bounded; this broader probe
is an explicit command.

## Bounded Read Experiment

The `mensor_representative_matrix` intent compares serial reads with batches of
four and eight, alternating mode order across three isolated runs per shape.
Raw evidence is written to `dist/performance/representative-matrix.json`.

Local Windows measurements on 2026-09-07 produced these medians in milliseconds:

| Shape | Serial | Four reads | Eight reads |
| --- | ---: | ---: | ---: |
| forms-heavy | 1780 | 976 | 981 |
| module-graph | 2712 | 1281 | 1330 |
| mixed | 1272 | 1359 | 1066 |

Eight reads reduced the medians by 45%, 51%, and 16%, respectively. Maximum RSS
increased by approximately 1.2, 3.7, and 1.8 MiB. Variance is material: the mixed
serial range was 1234-1961 ms and the eight-read range was 1057-1489 ms. These
are local observations, not portable performance budgets or tail estimates.

The compiler now prefetches at most eight source files from the next traversal
window. Parsing and diagnostic consumption remain ordered, rejected reads are
drained and surfaced when traversal reaches the file, and all reads retain the
existing discovery-identity, size, encoding, and post-read mutation checks.
Concurrent buffers are bounded by eight per-file limits; total process RSS is
not a hard cap. Sources remain cached only for the current check. The private
measurement entrypoint accepts a concurrency override; no CLI flag or package
root API is added.

## Scale Probe Follow-up

The existing `mensor_performance_full` probe on Node 24.18.0 / Windows x64
reported first/repeat durations of 792/817 ms (1k), 3463/6092 ms (5k), and
6735/7193 ms (10k). At 5k, source reads grew from 1342 to 3179 ms, discovery
from 1372 to 1543 ms, and TypeScript extraction from 586 to 1121 ms. HTML and
FormIndex phases remained below 30 ms combined in both samples. The repeated
5k slowdown is therefore dominated by source-read time in this observation;
two samples cannot identify the host filesystem, cache, or background-load
cause. It is not evidence of an HTML or semantic-rule scaling regression.
