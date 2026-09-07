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
