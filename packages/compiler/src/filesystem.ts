import { lstat, readFile, readdir } from "node:fs/promises";
import * as path from "node:path";

import {
  assertRelativePosixPath,
  compareText,
  fromProjectPath,
  InputFailure,
  joinProjectPath,
} from "./paths.js";

export async function assertProjectRoot(root: string): Promise<string> {
  const absoluteRoot = path.resolve(root);
  try {
    const stats = await lstat(absoluteRoot);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new InputFailure(
        "filesystem",
        "root.invalid",
        "The project root must be a real directory, not a symlink.",
      );
    }
  } catch (error) {
    if (error instanceof InputFailure) {
      throw error;
    }
    throw filesystemFailure(error, "root.unreadable", "The project root cannot be read.");
  }
  return absoluteRoot;
}

export async function readProjectFile(
  root: string,
  relativePath: string,
): Promise<string> {
  const safePath = assertRelativePosixPath(relativePath, "File path");
  await assertPathHasNoSymlink(root, safePath, false);
  try {
    return await readFile(fromProjectPath(root, safePath), "utf8");
  } catch (error) {
    throw filesystemFailure(
      error,
      "file.unreadable",
      `Cannot read project file ${JSON.stringify(safePath)}.`,
      safePath,
    );
  }
}

export async function discoverProjectFiles(
  root: string,
  sourceRoot: string,
  maxFiles: number,
): Promise<readonly string[]> {
  const safeSourceRoot = assertRelativePosixPath(sourceRoot, "sourceRoot");
  await assertPathHasNoSymlink(root, safeSourceRoot, true);
  const files: string[] = [];

  async function visit(relativeDirectory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(fromProjectPath(root, relativeDirectory), {
        withFileTypes: true,
      });
    } catch (error) {
      throw filesystemFailure(
        error,
        "directory.unreadable",
        `Cannot read source directory ${JSON.stringify(relativeDirectory)}.`,
        relativeDirectory,
      );
    }

    entries.sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      const relativeEntry = joinProjectPath(relativeDirectory, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        await visit(relativeEntry);
      } else if (entry.isFile()) {
        files.push(relativeEntry);
        if (files.length > maxFiles) {
          throw new InputFailure(
            "filesystem",
            "discovery.file_limit_exceeded",
            `Source discovery exceeded the configured limit of ${maxFiles} files.`,
            safeSourceRoot,
          );
        }
      }
    }
  }

  await visit(safeSourceRoot);
  return files;
}

async function assertPathHasNoSymlink(
  root: string,
  relativePath: string,
  requireDirectory: boolean,
): Promise<void> {
  const segments = relativePath.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    const current = segments.slice(0, index + 1).join("/");
    let stats;
    try {
      stats = await lstat(fromProjectPath(root, current));
    } catch (error) {
      throw filesystemFailure(
        error,
        "path.unreadable",
        `Cannot inspect project path ${JSON.stringify(current)}.`,
        current,
      );
    }
    if (stats.isSymbolicLink()) {
      throw new InputFailure(
        "filesystem",
        "path.symlink_forbidden",
        `Project path ${JSON.stringify(current)} is a symlink.`,
        current,
      );
    }
    if (index < segments.length - 1 && !stats.isDirectory()) {
      throw new InputFailure(
        "filesystem",
        "path.not_directory",
        `Project path ${JSON.stringify(current)} must be a directory.`,
        current,
      );
    }
    if (index === segments.length - 1) {
      const valid = requireDirectory ? stats.isDirectory() : stats.isFile();
      if (!valid) {
        throw new InputFailure(
          "filesystem",
          requireDirectory ? "path.not_directory" : "path.not_file",
          `Project path ${JSON.stringify(current)} has the wrong filesystem type.`,
          current,
        );
      }
    }
  }
}

function filesystemFailure(
  error: unknown,
  fallbackCode: string,
  message: string,
  file?: string,
): InputFailure {
  const code = isNodeError(error) && error.code === "ENOENT" ? "path.missing" : fallbackCode;
  return new InputFailure("filesystem", code, message, file);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
