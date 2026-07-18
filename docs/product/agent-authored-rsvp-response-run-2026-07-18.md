# Agent-Authored RSVP Response Run

- Date: 2026-07-18
- Cohort: `codex-subagents-rsvp-response-v1`
- Baseline: `f4046e0f2f11f6f18df0aeb2998f45208d5dc2aa`
- Brief: `rsvp-v2`
- Semantic oracle: `rsvp-semantic-oracle-v2`
- Output transport: `response-artifact-v1`
- Claim level: Exploratory only

## Result

No trial passed both the evaluator-owned semantic oracle and Mensor. This is a
response-only application-authoring probe, not a repair-rate measurement or a
model ranking.

| Model | Host calls | Unavailable records | Artifact completed | Artifact accepted | Semantic pass | Mensor pass | Any-trial pass | All-trials pass |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `umans/umans-glm-5.2` | 3 | 0 | 0 | 0 | 0 | 0 | no | no |
| `umans/umans-kimi-k2.7` | 3 | 0 | 3 | 2 | 0 | 2 | no | no |
| `opencode-go/minimax-m3` | 3 | 0 | 0 | 0 | 0 | 0 | no | no |
| `opencode-go/deepseek-v4-flash` | 0 | 3 | 0 | 0 | 0 | 0 | unavailable | unavailable |

The host advertised GLM 5.2, Kimi K2.7, and MiniMax M3. DeepSeek V4 Flash was
not advertised by the current subagent tool, so its three requested slots were
recorded as unavailable without substitution. GLM and MiniMax completed their
host sessions but returned no final response artifact in all three trials.

Kimi returned three responses. Trial 2 was rejected before materialization
because it wrapped the JSON document in a Markdown fence. Trials 1 and 3 were
valid bounded artifacts. Both generated seven files and passed Mensor with zero
diagnostics, but both failed the protected semantic oracle. The retained
observations do not contain generated source, so this report does not invent a
more specific runtime root cause.

## Per-Trial Evidence

| Trial | Artifact | Semantic oracle | Mensor | Result |
| --- | --- | --- | --- | --- |
| `glm-5.2-1` | no response | not run | not run | failed |
| `glm-5.2-2` | no response | not run | not run | failed |
| `glm-5.2-3` | no response | not run | not run | failed |
| `kimi-k2.7-1` | accepted, 7 files | failed | passed, 0 diagnostics | failed |
| `kimi-k2.7-2` | rejected | not run | not run | failed |
| `kimi-k2.7-3` | accepted, 7 files | failed | passed, 0 diagnostics | failed |
| `minimax-m3-1` | no response | not run | not run | failed |
| `minimax-m3-2` | no response | not run | not run | failed |
| `minimax-m3-3` | no response | not run | not run | failed |
| `deepseek-v4-flash-1` | unavailable | not run | not run | unavailable |
| `deepseek-v4-flash-2` | unavailable | not run | not run | unavailable |
| `deepseek-v4-flash-3` | unavailable | not run | not run | unavailable |

## Evidence Boundary

Each available-model call used a fresh subagent conversation and the same
self-contained brief, response transport, and contract authoring reference.
The prompt prohibited tools, filesystem access, network access, and repository
inspection, but the host did not enforce those restrictions. Workspace,
repository, network, and tool isolation therefore remain `not-enforced`.

The evaluator parsed the exact response text, materialized only accepted
artifacts into a fresh temporary project, and then ran the protected semantic
oracle and Mensor independently. Raw model responses and generated source were
deleted after canonical observations were emitted. Retained files contain
source digests, response digests for completed artifacts, generated relative
file names, and verdicts only.

## Interpretation

The two Mensor-clean but semantically failing artifacts are useful boundary
evidence: the current product checks project structure, form contracts, handler
placement, and static import boundaries; it does not prove arbitrary runtime
behavior. The result supports keeping semantic application tests beside Mensor
rather than broadening the compiler into a runtime verifier.

No public reliability, adoption, repairability, sandbox, or model-quality claim
may be derived from this run.
