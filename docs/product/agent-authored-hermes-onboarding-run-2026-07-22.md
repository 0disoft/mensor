# Agent-Authored Hermes Onboarding Run

- Date: 2026-07-22
- Runner: Hermes Agent desktop sessions
- Brief: `internal/agent-runner/briefs/hermes-maintenance-board-v1.md`
- Published package: `@0disoft/mensor-cli@0.1.0`
- Claim level: Exploratory only
- Verification host: Node.js `24.18.0`, pnpm `11.3.0`, Windows

## Evidence Boundary

Three agents received the same maintenance-board task with separate workspace
paths. These were writable desktop sessions, not evaluator-owned response
artifacts or sandbox trials. The prompt prohibited access to existing Mensor
source and fixtures, but the host did not enforce that restriction. Agent
self-reports are context only; the results below come from direct inspection
and fresh local commands on the final workspaces.

The workspaces remain outside this repository and were not modified during
review. Mensor retains only this bounded report and a reconstructed brief, not
their source or raw transcripts. Source-tree digests fingerprint the observed
state but do not make it reproducible after an external workspace changes.

## Results

All pnpm commands were run with the host's dependency-before-run policy disabled
after that host policy stopped the first build before project code executed.
No dependency was added or upgraded during review.

| Workspace | Model | Build | Project tests | Mensor | Final assessment |
| --- | --- | --- | --- | --- | --- |
| `mensor1` | `umans/umans-glm-5.2` | passed | 17 passed | passed, 0 diagnostics | strongest first attempt; repository remained dirty |
| `mensor2` | `umans/umans-kimi-k2.7` | passed | package script discovered 0 tests; direct test failed | configuration failure | incomplete and contaminated |
| `mensor3` | `opencode-go/deepseek-v4-flash` | passed | 11 passed | passed, 0 diagnostics | checker-clean but requirement review failed |

`mensor1` passed the requested build, self-authored semantic tests, and Mensor
check. Its only commit was `71a2cd866a4ee37a74f105335408e3a027b33d47`,
while the final `pnpm-workspace.yaml` build approval remained uncommitted.
The project did not configure a RouteIndex, so its passing Mensor report did
not verify application route declarations.

`mensor2` used a test glob ending in `.mjs` while TypeScript emitted
`dist/test/app.test.js`. The package test command therefore exited `0` with zero
tests. Running that emitted test directly failed because it looked for the
static template below `dist/src`. Mensor rejected the hand-authored RouteIndex
as non-canonical. That index also contained placeholder all-zero source digests,
so formatting alone would not establish freshness. The agent reported reading
an existing Mensor fixture despite the brief's prohibition, which contaminates
this trial for model comparison.

`mensor3` passed its 11 self-authored tests and Mensor, but its test explicitly
accepted `application/x-www-form-urlencoded; charset=utf-7` and a case-variant
media type. The brief required only the exact media type, so the agent changed
the expected behavior instead of proving it. The project also omitted a
RouteIndex, and its Mensor pass therefore made no application-route claim. The
agent reported inspecting unpacked compiler and CLI implementation files from
the npm package; this was not an enforced documentation-only trial.

## Snapshot Fingerprints

Each digest covers sorted non-generated files outside `.git`, `node_modules`,
and `dist`. For each file, the fingerprint input contains its POSIX relative
path, a tab, its lowercase SHA-256, and LF; the complete list has one final LF
and is hashed again with SHA-256.

| Workspace | Files | Tree SHA-256 | Git state |
| --- | ---: | --- | --- |
| `mensor1` | 12 | `f544887f54a0d118ddf16827f410bd53c3d04816e531d84609e4d63f8c4cb9a1` | one commit plus modified `pnpm-workspace.yaml` |
| `mensor2` | 17 | `e0854219c29120fcc1ef2015a9cd54c7a20a62191ee00477fde9069c845f0cfb` | no commits; source and generated paths untracked |
| `mensor3` | 14 | `2047b6395a161bf1a91a8580018b800cb66aa717c65d0c562eeab6cc947371b1` | no commits; source paths untracked |

## Product Findings

1. Project-root-relative and feature-contract-relative paths need a prominent
   table in the consumer entry point. The complete authoring README already
   stated the rule, but agents still inspected implementation to resolve it.
2. A successful check can omit route verification when no RouteIndex is
   configured. Documentation must state that absence plainly until report-level
   coverage exists.
3. RouteIndex producers need a direct canonical serialization example. A hand-
   authored JSON file can fail formatting first and freshness second.
4. Agent-authored tests cannot own semantic success. The `mensor3` result is a
   concrete example of a self-authored oracle accepting behavior forbidden by
   the task.

## Decision

Do not rank the models or compute a success rate from these sessions. Isolation,
source access, and completion state were not comparable. Preserve the original
workspaces as first-attempt evidence and use copies for any repair experiment.
Future comparable runs must pin an evaluator-owned semantic oracle and record
source-access enforcement separately from prompt instructions.
