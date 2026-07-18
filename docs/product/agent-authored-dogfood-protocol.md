# Agent-Authored Dogfood Protocol

- Status: First local harness implemented; provider integration deferred
- Owner: Maintainer
- External maintainer participation: Not planned
- First brief: `internal/agent-runner/briefs/guestbook-v1.md`
- First model cohort: `internal/agent-runner/cohorts/codex-subagents-v1.json`

## Purpose

This protocol measures whether a coding agent can learn Mensor's project
contract from maintained documentation and build a small compliant application
from an empty workspace. It replaces the previously considered external
maintainer recruitment path.

The result is agent-authored synthetic dogfood. It does not prove external
adoption, human authoring ergonomics, market demand, or general framework
compatibility.

## Trial Input

Each trial receives:

1. a fresh empty workspace;
2. a versioned application brief describing one small form-backed feature;
3. the maintained Mensor product, contract, CLI, and security documentation;
4. built local Mensor packages or an explicitly pinned published version;
5. the command names required to check the project and run its semantic tests;
   and
6. an explicit prohibition on reading or copying existing Mensor fixtures,
   examples, golden reports, test implementations, or another trial workspace.

The brief may name an allowed runtime such as plain Node or Hono, but it must
stay inside the implemented TypeScript, static HTML, URL-encoded form, and
static GET/POST boundary. A separate approved trial is required before a
dynamic template source can be treated as supported input.

The first maintained brief is `guestbook-v1`. It requests a dependency-free
Node ESM guestbook with a static URL-encoded form, in-memory state, independent
semantic tests, strict malformed-input handling, and HTML escaping. It does not
reuse the existing task fixtures.

## Required Output

The agent must produce a complete runnable project containing:

- application source;
- one project contract and the necessary feature contracts;
- static HTML owned by the generated application;
- semantic application tests independent of Mensor diagnostics; and
- no credentials, network dependency, generated lockfile from an unapproved
  install, copied upstream source, or hidden fixture dependency.

The generated project belongs to the trial workspace. It becomes a maintained
repository fixture only after source review, license review, deterministic
reproduction, and an explicit maintainer decision.

## Evaluation Order

1. Validate the brief and agent execution configuration before workspace
   mutation.
2. Record the exact brief revision, Mensor version, model identifier, adapter,
   process limits, and execution cohort without storing credentials or raw
   prompts in canonical results.
3. Let the agent build the project without access to existing Mensor examples.
4. Run the generated semantic tests first. A checker-clean project with missing
   behavior fails the trial.
5. Run Mensor and retain only diagnostic codes and bounded final-state facts.
6. Permit bounded correction rounds using diagnostics, not private fixture
   hints.
7. Re-run semantic tests and Mensor after the final agent change.
8. Reject a result that weakens the contract, removes the requested behavior,
   changes protected trial instructions, or depends on another trial's state.
9. Dispose the trial workspace after bounded result extraction unless its
   source is explicitly accepted as a reviewed fixture.

## Measurements

Keep generation and checker measurements separate:

- whether the requested application semantics passed;
- whether the final Mensor check passed;
- diagnostic codes produced before the final correction;
- correction rounds;
- application and contract file and non-empty-line counts;
- changed files attributable to the agent;
- contract weakening or semantic regression;
- unsupported input encountered; and
- bounded process outcome and resource-limit failures.

Do not turn one successful run into a percentage. Repeated trials must use
fresh workspaces and comparable execution cohorts. Pass-at-least-once and
all-runs-pass answer different questions and must remain separate.

## Codex Subagent Cohort v1

The first provider-backed cohort uses fresh Codex subagents with no inherited
conversation and the same pinned brief, documentation set, correction limit,
semantic oracle, and Mensor version for every model:

- `umans/umans-glm-5.2` with reasoning effort `high`;
- `umans/umans-kimi-k2.7` with reasoning effort `high`;
- `opencode-go/minimax-m3` with reasoning effort `high`; and
- `opencode-go/deepseek-v4-flash` with reasoning effort `high`.

Each result records the runner, provider, exact model identifier, reasoning
effort, and cohort identifier. A model that the current Codex subagent host
does not advertise is recorded as unavailable and skipped. It must not be
silently replaced by another provider, model, main-thread run, or inherited
agent. Results are reported per model; the first four runs are smoke evidence,
not a cross-model ranking or a repair-rate percentage.

Host-native subagent execution is exploratory until the host can bind each
subagent to the fresh trial workspace without exposing the Mensor repository,
other trial workspaces, or inherited conversation. Prompt instructions alone
do not prove that isolation. Such runs must not claim
`sandboxed-workspace-only` merely because the subagent used a separate task.

## Privacy and Security

- Trial inputs are project-owned synthetic briefs, not third-party source.
- Mensor's compiler remains offline and does not execute generated source.
- Application semantic tests execute only inside the approved bounded trial
  environment.
- API credentials are injected only into the agent adapter and never copied to
  the generated project, report, diagnostic, or transcript artifact.
- Canonical results exclude source text, absolute paths, environment values,
  raw prompts, raw model responses, and command stderr.
- Network access belongs to the model adapter only. The generated application,
  compiler, and semantic tests remain networkless unless a later trial contract
  explicitly changes that boundary.

## Current Harness Boundary

`runAgentAuthoredBuildTrial` in the private agent runner implements the local
workflow shell. Before creating mutable state it validates SHA-256 commitments
for the brief and allowed documents. It then creates a fresh workspace with
protected `input/` and empty `project/` directories, invokes an injected agent
port, rejects protected-input or root-boundary writes, runs separate semantic
and Mensor check ports, returns only bounded final-state facts, and disposes the
workspace on every outcome.

The adapter identity is part of the canonical result. This prevents results
from different Codex runners, providers, model aliases, reasoning settings, or
cohorts from being merged after the fact.

`createNodeSemanticTestPort` runs one project-relative Node test file with a
closed stdin, empty environment, timeout, and combined output limit. Its
isolation is explicitly `process-only`: it does not enforce network denial or
host-filesystem isolation and cannot support a sandbox claim. The current
end-to-end tests use `injected-test` agents. A provider-backed trial must use an
approved adapter and must record `sandboxed-workspace-only` only when that
isolation is actually enforced.

## Stop Conditions

Stop without a successful result when:

- the agent needs existing fixtures or upstream application source to proceed;
- the requested application falls outside the implemented input boundary;
- semantic tests cannot prove the requested behavior;
- a dependency install, runtime, or network effect lacks an approved command
  contract;
- the agent edits protected contracts or trial instructions to manufacture a
  pass;
- secrets or private host data enter generated files or canonical results; or
- workspace cleanup or execution attribution becomes uncertain.

## Decision Gate

Agent-authored dogfood may guide documentation, diagnostics, contract
ergonomics, and fixture coverage. It cannot support claims about external
maintainer adoption or human usability.

The local guestbook vertical slice is implemented with a fake injected agent.
Implement the first provider-backed build trial only after its allowed
documentation set, model adapter, credential boundary, sandbox enforcement,
process limits, and result wording are reviewed together. Do not add a new
evidence or attestation layer merely to start it; reuse the existing private
fixture-kit and bounded agent-runner boundaries where they fit.
