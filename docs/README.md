# Documentation

- Status: Proposed

## Sources of Truth

- Product identity and outcomes: `docs/product/00-product-brief.md`
- MVP requirements and acceptance criteria: `docs/product/02-spec.md`
- Component and trust boundaries: `docs/architecture/00-system-boundary.md`
- Non-negotiable engineering rules: `docs/engineering/00-project-invariants.md`
- Operational and release expectations: `docs/ops/00-operational-contract.md`
- Package ownership and dependency direction: `docs/monorepo/workspace-boundaries.md`
- CLI behavior: `docs/cli/command-contract.md`
- Library exports and compatibility: `docs/library/public-api.md`
- Machine-readable contract schemas: `spec/README.md`
- Executable behavior examples: `fixtures/README.md`
- Validation names and reporting: `VALIDATION.md`

Summary pages may link to these contracts but must not redefine them. When two
documents disagree, update the owning source first and then synchronize its
summaries.
