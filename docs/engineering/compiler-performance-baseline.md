# Compiler Performance Baseline

- Status: Local baseline recorded
- Evidence date: 2026-07-15
- Runtime: Node.js `v24.18.0`, Windows x64
- Command: `pnpm run performance`

## Question

How does one complete project check behave as the number of TypeScript source
files approaches the compiler's default 10,000-file discovery limit?

## Method

The performance script creates bounded temporary projects with exactly 1,000,
5,000, and 10,000 files under `sourceRoot`. Every project contains one feature
contract, one handler, one HTML form, and enough small TypeScript modules to
reach the declared count. An active import boundary forces the compiler to
parse every TypeScript module.

Each measurement runs in a fresh Node process. `durationMs` covers
`checkProject()` only, while `peakRssBytes` comes from that process's resource
usage. Project generation and cleanup are outside the timed worker. Cases run
serially.

The first process starts immediately after project generation and the repeat
process starts immediately after it. The script does not flush the operating
system filesystem cache, control CPU frequency, isolate the machine, or collect
enough samples for percentiles. These are `firstRun` and `repeatRun` values, not
portable cold and warm claims.

## Result

Session A was the first full measurement. Session B was a second full
measurement reached through the aggregate check after documentation changed.
They ran on the same host but without workload isolation.

| Session | Source files | Source bytes | First run | Repeat run | First peak RSS | Repeat peak RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 1,000 | 29,990 | 1,307.498 ms | 1,598.394 ms | 109,445,120 B | 109,105,152 B |
| A | 5,000 | 153,984 | 7,822.614 ms | 6,374.635 ms | 119,214,080 B | 117,805,056 B |
| A | 10,000 | 308,984 | 15,510.313 ms | 20,077.819 ms | 128,389,120 B | 128,311,296 B |
| B | 1,000 | 29,990 | 2,625.750 ms | 2,134.491 ms | 110,624,768 B | 110,694,400 B |
| B | 5,000 | 153,984 | 10,695.367 ms | 28,674.955 ms | 119,386,112 B | 118,886,400 B |
| B | 10,000 | 308,984 | 39,336.609 ms | 35,232.753 ms | 127,995,904 B | 129,032,192 B |

## Interpretation

Peak RSS grew by less than 20 MiB between the 1,000-file and 10,000-file
samples in each session. Elapsed time generally increased with file count, which
is consistent with the compiler reading and parsing every discovered source
file once. The large difference between sessions and the slower repeat samples
show that no stable latency or cache-speedup claim is supported.

This result is adequate as a developer-loop baseline, not as a release budget.
There is one sample per process and no controlled idle-machine run, CPU profile,
I/O breakdown, p50, p95, or cross-platform comparison. A future optimization
should first profile discovery, file reads, TypeScript parsing, and semantic
rule execution separately. It should preserve the one-read/one-parse invariant
before considering concurrency or persistent caches.

## Reproduction Contract

`scripts/run-compiler-performance.mjs` owns project generation, process
isolation, serial case order, and JSON reporting.
`scripts/compiler-performance-worker.mjs` owns the measured compiler call and
process peak RSS. The aggregate `check` command runs the 1,000-file smoke case;
the explicit `performance` command runs all three sizes. Neither command fails
on timing or memory values. They fail only if project generation, the compiler,
report parsing, or cleanup fails.
