# Agent-Authored Response Artifact Run: 2026-07-18

- Status: Exploratory response-transport run
- Baseline: `f2768532ac970b322876c984fe93f1a61ce25c41`
- Cohort: `codex-subagents-response-v1`
- Application brief: `guestbook-v2`
- Output transport: `response-artifact-v1`
- Semantic oracle: `guestbook-v2`
- Claim level: `exploratory-only`

## Purpose

This run checked whether fresh Codex subagents could learn the current Mensor
contract from pinned text and return a complete small application without
receiving a writable project path. The host materialized accepted JSON
artifacts, then ran the evaluator-owned semantic oracle and Mensor compiler.

It is not a model ranking, adoption study, repair-rate measurement, sandbox
attestation, or release gate. One trial per available model cannot support a
percentage or reliability claim.

## Outcomes

| Model | Artifact | Semantic oracle | Mensor | Exploratory result |
|---|---|---|---|---|
| `umans/umans-glm-5.2` | No response artifact | Not run | Not run | No output |
| `umans/umans-kimi-k2.7` | Accepted and materialized | Passed | Passed with no diagnostics | Final state passed |
| `opencode-go/minimax-m3` | Accepted and materialized | Passed | Passed with no diagnostics | Final state passed |
| `opencode-go/deepseek-v4-flash` | Model not advertised by the current subagent host | Not run | Not run | Unavailable without substitution |

The Kimi and MiniMax projects each supplied a static guestbook form, a
`createGuestbookApp({ templateHtml })` runtime, a server handler, and Mensor
project and feature contracts. Their responses were parsed as data and written
only after path, text, and size validation. Generated source and raw model
responses were disposed after bounded result extraction.

## Evidence Boundary

- The two passing results used the maintained artifact parser and materializer.
- The semantic oracle imported and executed generated application code through
  the existing `process-only` port.
- Mensor scanned the generated projects without executing their source.
- The model prompt prohibited tools, but the Codex host did not enforce tool
  disablement, repository invisibility, network denial, or filesystem sandboxing.
- The Mensor repository had no model-authored change after the run. Concurrent
  changes outside this repository made the parent-workspace fingerprint
  unsuitable as attribution evidence.
- No raw prompt, model response, generated source, absolute path, environment
  value, or command output is retained in canonical observations.

Accordingly, the observations fix every isolation field to `not-enforced` and
the claim level to `exploratory-only`. The passing final states show that the
documented contract was sufficient for two one-shot generations under this
transport. They do not show that either model is reliable across repeated runs.

## Product Findings

1. Response artifacts avoid the direct workspace-write failure seen in the
   first direct-write run.
2. The complete contract example plus evaluator interface was sufficient for
   two available models to produce checker-clean applications.
3. GLM again returned no artifact, so availability and empty-result handling
   remain first-class outcomes rather than retries hidden from the report.
4. The next useful evidence is repeated fresh trials and a second application
   shape, not another attestation layer around this single guestbook case.
