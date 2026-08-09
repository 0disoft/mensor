import { realpath } from "node:fs/promises";
import * as path from "node:path";

const activeRoots = new Set<string>();

export async function withWorkspaceLease<T>(
  root: string,
  operation: () => T | Promise<T>,
): Promise<T> {
  const canonicalRoot = normalizeRoot(await realpath(path.resolve(root)));
  if ([...activeRoots].some((activeRoot) => rootsOverlap(activeRoot, canonicalRoot))) {
    throw new Error("Agent evaluation workspace is already in use by this process.");
  }
  activeRoots.add(canonicalRoot);
  try {
    return await operation();
  } finally {
    activeRoots.delete(canonicalRoot);
  }
}

function normalizeRoot(root: string): string {
  return process.platform === "win32" ? root.toLowerCase() : root;
}

function rootsOverlap(left: string, right: string): boolean {
  return isSameOrDescendant(path.relative(left, right))
    || isSameOrDescendant(path.relative(right, left));
}

function isSameOrDescendant(relative: string): boolean {
  return relative.length === 0 || (
    relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}
