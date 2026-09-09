import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, open } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import * as path from "node:path";

const maxSourceBytes = 1_048_576;

export class TypeScriptTemplateFormIndexError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly file?: string,
  ) {
    super(message);
    this.name = "TypeScriptTemplateFormIndexError";
  }
}

export async function readSource(
  root: string,
  relativePath: string,
): Promise<{ readonly text: string; readonly digest: `sha256:${string}` }> {
  const absolutePath = path.resolve(root, relativePath);
  if (!isWithin(root, absolutePath)) {
    throw new TypeScriptTemplateFormIndexError(
      "form_indexer.source_outside_root",
      "Template source resolves outside the selected project root.",
      relativePath,
    );
  }
  await rejectSymbolicLinkComponents(root, absolutePath, relativePath);
  let handle: FileHandle | undefined;
  try {
    handle = await open(absolutePath, "r");
    const before = await handle.stat();
    if (!before.isFile()) {
      throw sourceFailure("form_indexer.source_not_file", "Template source must be a regular file.", relativePath);
    }
    if (before.size > maxSourceBytes) {
      throw sourceFailure("form_indexer.source_too_large", `Template source exceeds ${maxSourceBytes} bytes.`, relativePath);
    }
    const bytes = Buffer.alloc(before.size + 1);
    let bytesRead = 0;
    while (bytesRead < bytes.length) {
      const chunk = await handle.read(bytes, bytesRead, bytes.length - bytesRead, bytesRead);
      if (chunk.bytesRead === 0) break;
      bytesRead += chunk.bytesRead;
    }
    const after = await handle.stat();
    await rejectSymbolicLinkComponents(root, absolutePath, relativePath);
    const current = await lstat(absolutePath);
    if (bytesRead !== before.size || !sameFile(before, after) || !sameFile(after, current)) {
      throw sourceFailure("form_indexer.source_changed", "Template source changed while it was read.", relativePath);
    }
    const sourceBytes = bytes.subarray(0, bytesRead);
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(sourceBytes);
    } catch {
      throw sourceFailure("form_indexer.source_encoding_invalid", "Template source must be valid UTF-8.", relativePath);
    }
    return {
      text,
      digest: `sha256:${createHash("sha256").update(sourceBytes).digest("hex")}`,
    };
  } catch (error) {
    if (error instanceof TypeScriptTemplateFormIndexError) throw error;
    throw sourceFailure("form_indexer.source_read_failed", "Template source could not be read.", relativePath);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function rejectSymbolicLinkComponents(
  root: string,
  absolutePath: string,
  relativePath: string,
): Promise<void> {
  const relative = path.relative(root, absolutePath);
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stats = await lstat(current).catch(() => undefined);
    if (stats === undefined) {
      throw sourceFailure("form_indexer.source_read_failed", "Template source could not be read.", relativePath);
    }
    if (stats.isSymbolicLink()) {
      throw sourceFailure("form_indexer.source_symlink", "Template source must not use symbolic-link components.", relativePath);
    }
  }
}

export function normalizeSourcePath(value: string): string {
  if (
    value.length === 0
    || path.isAbsolute(value)
    || path.win32.isAbsolute(value)
    || value.includes("\\")
  ) {
    throw sourceFailure("form_indexer.source_path_invalid", "Template source must be a root-relative POSIX path.", value);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === ".."
    || /[:\u0000-\u001f\u007f]/u.test(segment) || /[. ]$/u.test(segment)
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment))) {
    throw sourceFailure("form_indexer.source_path_invalid", "Template source path is not canonical.", value);
  }
  return value;
}

function sourceFailure(code: string, message: string, file: string) {
  return new TypeScriptTemplateFormIndexError(code, message, file);
}

function sameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (
    relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}
