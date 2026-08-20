import { randomUUID } from "node:crypto";
import { link, lstat, open, unlink } from "node:fs/promises";
import * as path from "node:path";

import type {
  CompilerFailure,
  DraftContractFile,
} from "@0disoft/mensor-compiler";

interface FileIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
}

interface StagedDraft {
  readonly file: DraftContractFile;
  readonly identity: FileIdentity;
  readonly target: string;
  readonly temporary: string;
}

export async function writeDraftFiles(
  root: string,
  files: readonly DraftContractFile[],
): Promise<CompilerFailure | undefined> {
  const duplicate = duplicatePath(files);
  if (duplicate !== undefined) {
    return {
      kind: "configuration",
      code: "init.output_path_conflict",
      message: `Draft output ${JSON.stringify(duplicate)} was requested more than once.`,
      file: duplicate,
    };
  }

  const staged: StagedDraft[] = [];
  for (const file of files) {
    const result = await stageDraftFile(root, file);
    if (!result.ok) {
      return (await cleanupStagedDrafts(staged)) ?? result.failure;
    }
    staged.push(result.value);
  }

  const published: StagedDraft[] = [];
  for (const draft of staged) {
    const failure = await publishDraftFile(draft);
    if (failure !== undefined) {
      const rollbackFailure = await rollbackDraftFiles(published);
      const cleanupFailure = await cleanupStagedDrafts(staged);
      return rollbackFailure ?? cleanupFailure ?? failure;
    }
    published.push(draft);
  }

  await cleanupStagedDrafts(staged);
  return undefined;
}

async function stageDraftFile(
  root: string,
  file: DraftContractFile,
): Promise<
  | { readonly ok: true; readonly value: StagedDraft }
  | { readonly ok: false; readonly failure: CompilerFailure }
> {
  let target: string;
  try {
    target = resolveOutputPath(root, file.path);
  } catch {
    return {
      ok: false,
      failure: {
        kind: "configuration",
        code: "init.output_path_invalid",
        message: `Draft output ${JSON.stringify(file.path)} escaped the selected project root.`,
        file: file.path,
      },
    };
  }

  const parentFailure = await validateOutputParent(root, target, file.path);
  if (parentFailure !== undefined) {
    return { ok: false, failure: parentFailure };
  }

  const temporary = path.join(
    path.dirname(target),
    `.mensor-${path.basename(target)}-${randomUUID()}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, "wx");
    await handle.writeFile(file.content, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    const identity = await lstat(temporary, { bigint: true });
    if (!identity.isFile() || identity.isSymbolicLink()) {
      throw new Error("Staged draft is not a regular file.");
    }
    return {
      ok: true,
      value: {
        file,
        identity: { dev: identity.dev, ino: identity.ino },
        target,
        temporary,
      },
    };
  } catch (error) {
    if (handle !== undefined) {
      try {
        await handle.close();
      } catch {
        // Preserve the primary staging failure.
      }
    }
    await removeBestEffort(temporary);
    return {
      ok: false,
      failure: mapWriteFailure(error, file.path),
    };
  }
}

async function publishDraftFile(
  draft: StagedDraft,
): Promise<CompilerFailure | undefined> {
  try {
    await link(draft.temporary, draft.target);
    return undefined;
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") {
      return {
        kind: "configuration",
        code: "init.output_exists",
        message: `Refusing to overwrite existing output ${JSON.stringify(draft.file.path)}.`,
        file: draft.file.path,
      };
    }
    return mapWriteFailure(error, draft.file.path);
  }
}

async function rollbackDraftFiles(
  drafts: readonly StagedDraft[],
): Promise<CompilerFailure | undefined> {
  for (const draft of [...drafts].reverse()) {
    try {
      const current = await lstat(draft.target, { bigint: true });
      if (
        current.dev !== draft.identity.dev ||
        current.ino !== draft.identity.ino
      ) {
        return rollbackFailure(draft.file.path);
      }
      await unlink(draft.target);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        continue;
      }
      return rollbackFailure(draft.file.path);
    }
  }
  return undefined;
}

async function cleanupStagedDrafts(
  drafts: readonly StagedDraft[],
): Promise<CompilerFailure | undefined> {
  for (const draft of drafts) {
    try {
      await unlink(draft.temporary);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        continue;
      }
      return {
        kind: "filesystem",
        code: "init.cleanup_failed",
        message: `Temporary draft for ${JSON.stringify(draft.file.path)} could not be removed.`,
        file: draft.file.path,
      };
    }
  }
  return undefined;
}

async function validateOutputParent(
  root: string,
  target: string,
  displayPath: string,
): Promise<CompilerFailure | undefined> {
  const resolvedRoot = path.resolve(root);
  const parent = path.dirname(target);
  const relativeParent = path.relative(resolvedRoot, parent);
  const segments = relativeParent.length === 0
    ? []
    : relativeParent.split(path.sep);
  let current = resolvedRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        return {
          kind: "filesystem",
          code: "init.output_parent_unsafe",
          message: `The parent path for ${JSON.stringify(displayPath)} must contain only real directories.`,
          file: displayPath,
        };
      }
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return {
          kind: "filesystem",
          code: "init.output_parent_missing",
          message: `The parent directory for ${JSON.stringify(displayPath)} does not exist.`,
          file: displayPath,
        };
      }
      return {
        kind: "filesystem",
        code: "init.output_parent_unreadable",
        message: `The parent directory for ${JSON.stringify(displayPath)} cannot be inspected.`,
        file: displayPath,
      };
    }
  }
  return undefined;
}

function mapWriteFailure(error: unknown, file: string): CompilerFailure {
  if (isNodeError(error) && error.code === "ENOENT") {
    return {
      kind: "filesystem",
      code: "init.output_parent_missing",
      message: `The parent directory for ${JSON.stringify(file)} does not exist.`,
      file,
    };
  }
  return {
    kind: "filesystem",
    code: "init.output_write_failed",
    message: `Cannot create contract draft ${JSON.stringify(file)}.`,
    file,
  };
}

function rollbackFailure(file: string): CompilerFailure {
  return {
    kind: "filesystem",
    code: "init.rollback_failed",
    message: `Draft creation failed and ${JSON.stringify(file)} could not be safely removed.`,
    file,
  };
}

function duplicatePath(files: readonly DraftContractFile[]): string | undefined {
  const seen = new Set<string>();
  for (const file of files) {
    if (seen.has(file.path)) {
      return file.path;
    }
    seen.add(file.path);
  }
  return undefined;
}

function resolveOutputPath(root: string, relativePath: string): string {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, ...relativePath.split("/"));
  const relative = path.relative(resolvedRoot, target);
  if (
    relative.length === 0 ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Draft output escaped the selected project root.");
  }
  return target;
}

async function removeBestEffort(file: string): Promise<void> {
  try {
    await unlink(file);
  } catch {
    // The path may never have been created or may already be gone.
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
