# Agent-Authored Published Onboarding Run

- Date: 2026-07-21
- Cohort: `codex-subagents-published-onboarding-v1`
- Baseline: `12724813a9e0d63c9b65525df50ff9e02cc66f16`
- Brief: `published-rsvp-onboarding-v1`
- Semantic oracle: `published-rsvp-onboarding-oracle-v1`
- Output transport: `response-artifact-v1`
- Published package: `@0disoft/mensor-cli@0.1.0`
- Claim level: Exploratory only

## Result

One of the three requested models returned an accepted project artifact. That
artifact declared the exact public package, installed it from the official npm
registry with lifecycle scripts disabled, and passed Mensor with zero
diagnostics. It failed the evaluator-owned application semantic oracle, so no
trial passed every gate.

| Model | Host call | Artifact | Package contract | Semantic oracle | Mensor | Final result |
| --- | ---: | --- | --- | --- | --- | --- |
| `umans/umans-glm-5.2` | 1 | no final response | not run | not run | not run | failed |
| `umans/umans-kimi-k2.7` | 1 | accepted, 7 files | passed | failed | passed, 0 diagnostics | failed |
| `opencode-go/deepseek-v4-flash` | 1 | no final response before bounded stop | not run | not run | not run | failed |

No MiniMax model was called. No model was retried or substituted. DeepSeek V4
Flash was available and started successfully, but the host session was stopped
after the bounded wait without a final response artifact.

## Evaluation Path

The evaluator accepted only Response Artifact v1 data. It materialized accepted
files into a fresh temporary project, rejected unsafe package metadata before
installation, used the official npm registry and an isolated pnpm store,
disabled lifecycle scripts, verified the installed CLI package identity and
version, then ran the protected semantic oracle and installed CLI separately.

Raw responses, generated application source, command output, temporary package
stores, and absolute paths were not retained. The tracked observations contain
only digests, model and cohort identity, generated relative paths, diagnostic
codes, and derived verdicts.

## Interpretation

The Kimi result is evidence that one fresh model could learn the published
package declaration and current Mensor contract from the supplied public
documentation. It is not evidence that Mensor proves arbitrary application
behavior: a checker-clean project still failed its independent semantic test.

The two missing artifacts are output-completion failures, not Mensor diagnostic
failures. With one trial per model, this run does not support model ranking,
success-rate, adoption, human-usability, sandbox, or repairability claims.

## Product Decision

Do not add a template adapter, plugin system, runtime, or another evidence layer
from this run. The next bounded experiment should inject one Mensor-owned
contract defect into an accepted artifact and test diagnostic-only repair. That
repair trial still requires an evaluator-owned semantic oracle and may not
reuse generated source from this run because it was intentionally deleted.
