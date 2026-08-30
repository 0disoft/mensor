# ADR 0037: CLI Owns Atomic Manifest Materialization

- Status: Accepted
- Date: 2026-08-30

## Context

`compileProject` owns source analysis and canonical RuntimeManifest v1
construction, but a library call must not choose a consumer's filesystem
location or replace files as a side effect. The CLI needs a practical artifact
workflow without moving source scanning, manifest semantics, or deployment
policy into its process shell.

A failed compile must not delete or partially overwrite the last usable
manifest. Output paths are also untrusted CLI input and may traverse a symbolic
link or escape the selected project root.

## Decision

`mensor compile` delegates analysis and manifest construction to
`compileProject`, then materializes the canonical bytes in the CLI package.

- The default output is `.mensor/manifest.json` below the selected project
  root.
- `--out` accepts only a non-empty root-relative path without empty, current,
  or parent-directory segments.
- Existing parent segments are inspected one at a time and symbolic links are
  rejected before missing directories are created.
- The destination itself must be an unused path or a regular file, never a
  directory or symbolic link.
- The CLI writes a private temporary file in the destination directory, flushes
  its contents, and renames it over the destination only after a clean compile.
- Diagnostic, configuration, and write failures preserve an existing manifest.
- JSON mode writes the same canonical bytes to stdout only after the filesystem
  replacement succeeds.

The compiler library remains free of artifact-write side effects. The CLI does
not import parsers, rescan source, or infer deployment paths.

## Consequences

Consumers get one deterministic command suitable for local builds and CI while
retaining the library API for hosts that own storage themselves. Portable Node
filesystem APIs cannot eliminate every hostile same-user time-of-check race;
the implementation prevents lexical escape and ordinary symbolic-link
traversal but does not claim OS sandbox isolation.

Generated `.mensor/` output is ignored by this repository. A consumer may track
or package a manifest only when its own deployment contract requires it.

## Rejected Alternatives

### Write from `compileProject`

Rejected because a pure compiler result should not select paths or mutate the
filesystem.

### Stream only to stdout

Rejected as the sole workflow because build systems need a stable artifact and
shell redirection can truncate an existing file before compilation fails.

### Delete then rename on every platform

Rejected because deletion creates a visible missing-artifact window and loses
the previous valid manifest when replacement fails.
