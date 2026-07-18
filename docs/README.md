# Documentation

- Status: Proposed

## Sources of Truth

- Product identity and outcomes: `docs/product/00-product-brief.md`
- MVP requirements and acceptance criteria: `docs/product/02-spec.md`
- Component and trust boundaries: `docs/architecture/00-system-boundary.md`
- Non-negotiable engineering rules: `docs/engineering/00-project-invariants.md`
- Operational and release expectations: `docs/ops/00-operational-contract.md`
- Package ownership and dependency direction: `docs/monorepo/workspace-boundaries.md`
- Accepted architecture decisions: `docs/adr/`
- CLI behavior: `docs/cli/command-contract.md`
- Library exports and compatibility: `docs/library/public-api.md`
- Machine-readable contract schemas: `packages/contract/spec/README.md`
- Executable behavior examples: `fixtures/README.md`
- Validation names and reporting: `VALIDATION.md`

## Research Notes

- HonoX compatibility boundary: `docs/engineering/honox-compatibility-spike.md`
- Local compiler performance baseline: `docs/engineering/compiler-performance-baseline.md`
- Hono adoption cost report: `docs/product/hono-adoption-cost.md`
- SonicJS external adoption study: `docs/product/sonicjs-adoption-study.md`
- External static HTML candidate search: `docs/product/external-static-html-candidate-search.md`
- Agent-authored dogfood protocol: `docs/product/agent-authored-dogfood-protocol.md`
- First Codex subagent run report: `docs/product/agent-authored-dogfood-run-2026-07-18.md`
- Response-artifact subagent run report: `docs/product/agent-authored-response-run-2026-07-18.md`
- First agent-authored brief: `../internal/agent-runner/briefs/guestbook-v1.md`
- Evaluator-owned guestbook brief: `../internal/agent-runner/briefs/guestbook-v2.md`
- Guestbook semantic oracle: `../internal/agent-runner/oracles/guestbook-v2.test.mjs`
- Second agent-authored brief: `../internal/agent-runner/briefs/rsvp-v1.md`
- First Codex subagent cohort: `../internal/agent-runner/cohorts/codex-subagents-v1.json`
- Current Codex subagent cohort: `../internal/agent-runner/cohorts/codex-subagents-v2.json`
- Response-only subagent cohort: `../internal/agent-runner/cohorts/codex-subagents-response-v1.json`
- Response artifact transport: `../internal/agent-runner/briefs/response-artifact-v1.md`
- Response artifact schema: `../internal/agent-runner/spec/agent-authored-project-artifact-v1.schema.json`
- Exploratory subagent observation schema: `../internal/agent-runner/spec/agent-authored-build-exploratory-observation-v3.schema.json`
- Response-artifact observations: `../internal/agent-runner/observations/codex-subagents-response-v1/`
- FormIndex v0 design: `docs/architecture/form-index-v0.md`
- FormIndex boundary decision: `docs/adr/0030-form-index-is-the-template-fact-boundary.md`
- Evaluator-owned semantic oracle decision: `docs/adr/0031-semantic-oracles-are-evaluator-owned.md`
- Model response materialization decision: `docs/adr/0032-agent-projects-cross-the-model-boundary-as-data.md`

Summary pages may link to these contracts but must not redefine them. When two
documents disagree, update the owning source first and then synchronize its
summaries.
