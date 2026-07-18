# ADR-0032: Agent Projects Cross the Model Boundary as Data

- Status: Accepted
- Date: 2026-07-18

## Context

A host-native Codex subagent assigned to an isolated trial directory wrote a
`package.json` in the parent workspace. The prompt named the allowed directory,
but the host did not bind the subagent process to it. Prompt wording therefore
cannot be the filesystem boundary for an untrusted generated project.

The evaluator-owned semantic oracle fixes self-certification after generation,
but it does not prevent the generator from modifying unrelated files while
creating the project.

## Decision

The preferred host integration accepts a bounded project artifact in the model
response and materializes it deterministically.

- The model receives pinned text inputs, not writable host paths.
- The requested response is one versioned JSON file map.
- The parser rejects unknown fields, path traversal, case collisions,
  file/directory prefix collisions, non-portable paths, non-canonical text, and
  bounded-size violations before any write.
- The materializer writes only into a real empty project root with exclusive
  file creation.
- The semantic oracle and Mensor run only after successful materialization.
- A provider adapter that can truly disable tools should do so. A prompt-only
  no-tools instruction remains exploratory evidence.

## Consequences

Large or binary generated projects are outside this transport. The first
contract allows at most 64 UTF-8 text files, 256 KiB per file, and 1 MiB total.
Model responses can be rejected for transport defects before application
semantics are considered.

The response artifact prevents the evaluator from applying an arbitrary model
filesystem operation. It does not by itself sandbox semantic execution or
prove that a host-native subagent ignored tools that remained available.
