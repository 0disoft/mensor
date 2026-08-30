import {
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import * as path from "node:path";

let temporaryFileCounter = 0;

export async function writeCanonicalArtifactAtomic(
  root: string,
  relativeOutput: string,
  text: string,
): Promise<void> {
  const rootPath = await realpath(root);
  const outputPath = path.resolve(rootPath, relativeOutput);
  const parentPath = path.dirname(outputPath);
  await ensureSafeParent(rootPath, parentPath);

  const resolvedParent = await realpath(parentPath);
  if (!isWithin(rootPath, resolvedParent)) {
    throw new Error("Manifest output parent resolves outside the project root.");
  }

  const existing = await lstatOrUndefined(outputPath);
  if (existing?.isSymbolicLink() === true || existing?.isDirectory() === true) {
    throw new Error("Manifest output must be a regular file or an unused path.");
  }

  const temporaryPath = path.join(
    resolvedParent,
    `.${path.basename(outputPath)}.${process.pid}.${temporaryFileCounter += 1}.tmp`,
  );
  let handle: FileHandle | undefined;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(text, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, outputPath);
  } finally {
    await handle?.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
  }
}

export async function writeManifestAtomic(
  root: string,
  relativeOutput: string,
  text: string,
): Promise<void> {
  await writeCanonicalArtifactAtomic(root, relativeOutput, text);
}

async function ensureSafeParent(root: string, parent: string): Promise<void> {
  const relative = path.relative(root, parent);
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let entry = await lstatOrUndefined(current);
    if (entry === undefined) {
      await mkdir(current);
      entry = await lstat(current);
    }
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new Error("Manifest output parent must contain only directories.");
    }
  }
}

async function lstatOrUndefined(target: string) {
  try {
    return await lstat(target);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
