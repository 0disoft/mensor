# Agent Guidance

- Status: Proposed

Start with `AGENTS.md`, `CHECKLIST.md`, `VALIDATION.md`, and
`.agents/context-map.md`. Follow the route for the surface being changed.

Product behavior is owned by `docs/product/02-spec.md`. Component and trust
boundaries are owned by `docs/architecture/00-system-boundary.md`. Do not copy
those contracts into agent instructions or weaken them to make a check pass.

The repository is currently documentation-first. Do not invent implementation
packages, commands, runtime behavior, or compatibility claims beyond the
accepted source-of-truth documents.
