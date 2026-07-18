# Agent-Authored Dogfood Run: 2026-07-18

- Status: Exploratory protocol-finding run
- Baseline: `17d337855e4333ecf8e4160007d35353f2689ca0`
- Cohort: `codex-subagents-v1`
- Brief: `guestbook-v1`
- Claim level: none; excluded from success metrics

## Purpose

This run exercised the host-native Codex subagent path before a controlled
provider-backed claim. It was intended to find orchestration, documentation,
and oracle defects. It was not a model ranking or repair-rate measurement.

The first attempt used live repository documentation and relative paths. Those
inputs could drift during generation, so every first-attempt output was
excluded. A second attempt copied the allowed documents into separate model
input directories at the recorded baseline.

## Outcomes

| Model | Observable outcome | Verdict |
|---|---|---|
| `umans/umans-glm-5.2` | Completed without a result and created no project files. | No output |
| `umans/umans-kimi-k2.7` | Created eight project files and reported six passing self-authored tests. Runtime code reconstructed the form in JavaScript instead of using the static source. | Semantic protocol failure |
| `opencode-go/minimax-m3` | Created seven project files and reported twelve passing self-authored tests, but also wrote a `package.json` outside the assigned project boundary. | Workspace-boundary failure |
| `opencode-go/deepseek-v4-flash` | Not advertised by the Codex subagent tool on this host. | Unavailable without substitution |

The out-of-bound MiniMax write replaced the parent workspace `package.json`.
It was detected immediately and restored from the existing Git baseline plus
the user's `mustflow` version update retained in `bun.lock`. No generated
project file was committed.

## Findings

1. Live repository paths are not pinned inputs. Allowed documents must be
   copied and hashed before generation.
2. Prompt-only write scopes do not enforce filesystem isolation. A compliant
   final project does not erase an out-of-bound write.
3. Agent-authored tests are not independent semantic evidence.
4. The contract documentation needed one complete minimal authoring example;
   otherwise agents invented unsupported keys such as `schemaVersion`,
   `formId`, and `exportName`.
5. A static form detected by Mensor is not proof that the runtime actually
   renders that source.

## Changes Triggered

- Added the complete project and feature contract example.
- Added `exploratory-only` observation schema and canonical parser.
- Ignored local `trial-output/` so generated source cannot enter commits by
  accident.
- Added guestbook v2 with a stable application interface.
- Added a protected evaluator-owned semantic oracle with template injection.
- Added cohort v2 and ADR-0031.

## Remaining Gate

Run `codex-subagents-v2` from fresh copied inputs and grade it with the protected
oracle plus Mensor. Host-native subagent runs remain exploratory until the
filesystem and repository-visibility boundaries are enforced rather than
requested only in prompt text.
