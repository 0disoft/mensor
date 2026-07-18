# Agent Output Transport: Response Artifact v1

## Purpose

This transport carries an agent-authored project as data. The coding agent
does not receive a writable project path and must not call filesystem, shell,
network, browser, or repository tools. The evaluator materializes validated
files after the model response is complete.

## Required Response

Return one JSON document and no Markdown fence, commentary, completion claim,
or tool call. The document must satisfy
`agent-authored-project-artifact-v1.schema.json`:

```json
{
  "schemaVersion": 1,
  "kind": "agent-authored-project-artifact",
  "files": [
    {
      "path": "package.json",
      "content": "{\"private\":true,\"type\":\"module\"}\n"
    }
  ]
}
```

Every `path` is relative to the empty project root and uses `/`. Every
`content` value is the complete UTF-8 text of that file, uses LF line endings,
and ends with one newline. File entries may arrive in any order; the evaluator
canonicalizes them before writing.

## Rejection Rules

The evaluator rejects the whole response before writing when it contains:

- invalid JSON, unknown fields, or a different schema version or kind;
- an absolute, backslash, drive-qualified, dot-segment, empty-segment,
  control-character, case-colliding, or non-portable file path;
- a path that must be both a file and a directory;
- an empty file, CRLF text, missing final newline, or forbidden control byte;
- more than 64 files, more than 256 KiB in one file, or more than 1 MiB total;
  or
- a target project root that is not a real empty directory.

The transport limits where the evaluator writes the response. A host-native
Codex subagent may still have tools available despite the instruction not to
use them, so this transport does not prove tool disablement, repository
invisibility, network denial, or sandbox enforcement. Such a run remains
exploratory-only.
