# Compiler Performance Baseline

- Status: Local baseline recorded; phase instrumentation active
- Evidence dates: 2026-07-15 and 2026-07-16
- Runtime: Node.js `v24.18.0`, Windows x64
- Command: `pnpm run performance`
- Configured intent: `mensor_performance`

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
serially. Current reports also include template document and byte counts plus
exclusive phase durations for discovery, source reads, TypeScript extraction,
HTML reads, HTML extraction, FormIndex validation, semantic rules, and other
compiler work. Nested work is subtracted from its parent phase rather than
double-counted.

The first process starts immediately after project generation and the repeat
process starts immediately after it. The script does not flush the operating
system filesystem cache, control CPU frequency, isolate the machine, or collect
enough samples for percentiles. These are `firstRun` and `repeatRun` values, not
portable cold and warm claims.

## Result

Session A was the first full measurement. Session B was a second full
measurement reached through the aggregate check after documentation changed.
They ran on the same host but without workload isolation.

Session C was the first full measurement after exclusive phase instrumentation.
It ran through the configured `mensor_performance` intent on 2026-07-16. It used
the same host class and method but was not interleaved with Sessions A or B.

| Session | Source files | Source bytes | First run | Repeat run | First peak RSS | Repeat peak RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 1,000 | 29,990 | 1,307.498 ms | 1,598.394 ms | 109,445,120 B | 109,105,152 B |
| A | 5,000 | 153,984 | 7,822.614 ms | 6,374.635 ms | 119,214,080 B | 117,805,056 B |
| A | 10,000 | 308,984 | 15,510.313 ms | 20,077.819 ms | 128,389,120 B | 128,311,296 B |
| B | 1,000 | 29,990 | 2,625.750 ms | 2,134.491 ms | 110,624,768 B | 110,694,400 B |
| B | 5,000 | 153,984 | 10,695.367 ms | 28,674.955 ms | 119,386,112 B | 118,886,400 B |
| B | 10,000 | 308,984 | 39,336.609 ms | 35,232.753 ms | 127,995,904 B | 129,032,192 B |
| C | 1,000 | 29,990 | 1,817.730 ms | 2,155.877 ms | 119,091,200 B | 120,246,272 B |
| C | 5,000 | 153,984 | 13,629.449 ms | 10,506.859 ms | 124,477,440 B | 124,760,064 B |
| C | 10,000 | 308,984 | 21,182.860 ms | 21,129.974 ms | 134,594,560 B | 134,266,880 B |

## Session C Phase Breakdown

All durations below are exclusive and therefore sum with the FormIndex phases
and `other` to the corresponding total duration.

| Source files | Run | Discovery | Source read | TypeScript extraction | Rule evaluation | Other |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1,000 | First | 127.490 ms | 1,418.280 ms | 212.370 ms | 23.876 ms | 18.965 ms |
| 1,000 | Repeat | 152.593 ms | 1,663.872 ms | 265.139 ms | 32.070 ms | 21.187 ms |
| 5,000 | First | 1,198.557 ms | 11,294.010 ms | 951.101 ms | 131.469 ms | 32.290 ms |
| 5,000 | Repeat | 671.498 ms | 8,948.558 ms | 755.437 ms | 97.875 ms | 18.853 ms |
| 10,000 | First | 2,567.426 ms | 17,009.369 ms | 1,376.736 ms | 167.611 ms | 32.423 ms |
| 10,000 | Repeat | 1,558.794 ms | 18,015.034 ms | 1,340.967 ms | 175.154 ms | 23.498 ms |

| Source files | Run | HTML read | HTML extraction | FormIndex validation | Documents | Template bytes |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1,000 | First | 1.587 ms | 9.856 ms | 5.305 ms | 1 | 113 |
| 1,000 | Repeat | 2.040 ms | 13.284 ms | 5.693 ms | 1 | 113 |
| 5,000 | First | 1.850 ms | 14.243 ms | 5.929 ms | 1 | 113 |
| 5,000 | Repeat | 1.268 ms | 9.725 ms | 3.646 ms | 1 | 113 |
| 10,000 | First | 2.294 ms | 20.046 ms | 6.954 ms | 1 | 113 |
| 10,000 | Repeat | 1.674 ms | 10.111 ms | 4.744 ms | 1 | 113 |

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

Sessions A and B predate phase instrumentation and therefore have no valid
phase breakdown to backfill. New runs must report the measured phase fields;
historical total-time and RSS values remain as recorded rather than being
reconstructed.

Session C shows that source reads dominate this generated workload. It does not
prove that filesystem I/O is the dominant cost in external repositories, and
the non-interleaved historical sessions do not support a regression claim.

## Reproduction Contract

`scripts/run-compiler-performance.mjs` owns project generation, process
isolation, serial case order, and JSON reporting.
`scripts/compiler-performance-worker.mjs` owns the measured compiler call,
exclusive phase projection, and process peak RSS. The aggregate `check` command
runs the 1,000-file smoke case;
the explicit `performance` command runs all three sizes. Neither command fails
on timing or memory values. They fail only if project generation, the compiler,
report parsing, or cleanup fails.
