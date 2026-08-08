import { lstat, open, readdir } from "node:fs/promises";
import * as path from "node:path";

import {
  assertRelativePosixPath,
  compareText,
  fromProjectPath,
  InputFailure,
  joinProjectPath,
} from "./paths.js";

interface ProjectFileStat {
  readonly ctimeNs: bigint;
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mtimeNs: bigint;
  readonly size: bigint;
  readonly isDirectory: () => boolean;
  readonly isFile: () => boolean;
  readonly isSymbolicLink: () => boolean;
}

interface ProjectFileHandle {
  readonly close: () => Promise<void>;
  readonly read: (
    buffer: Buffer,
    offset: number,
    length: number,
    position: number,
  ) => Promise<{ readonly bytesRead: number }>;
  readonly stat: () => Promise<ProjectFileStat>;
}

export interface ProjectFileOperations {
  readonly lstat: (file: string) => Promise<ProjectFileStat>;
  readonly open: (file: string) => Promise<ProjectFileHandle>;
}

const nodeProjectFileOperations: ProjectFileOperations = {
  lstat: (file) => lstat(file, { bigint: true }),
  async open(file) {
    const handle = await open(file, "r");
    return {
      close: () => handle.close(),
      read: (buffer, offset, length, position) =>
        handle.read(buffer, offset, length, position),
      stat: () => handle.stat({ bigint: true }),
    };
  },
};

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
  maxFileBytes: number,
  operations: ProjectFileOperations = nodeProjectFileOperations,
): Promise<string> {
  const safePath = assertRelativePosixPath(relativePath, "File path");
  await assertParentPathHasNoSymlink(root, safePath, operations);
  let handle: ProjectFileHandle | undefined;
  let primaryError: unknown;
  try {
    const absolutePath = fromProjectPath(root, safePath);
    handle = await operations.open(absolutePath);
    const before = await handle.stat();
    assertRegularFile(before, safePath);
    assertFileSize(before.size, safePath, maxFileBytes);
    const bytes = await readBounded(handle, maxFileBytes);
    const after = await handle.stat();
    const pathAfter = await operations.lstat(absolutePath);
    assertStableFile(before, after, pathAfter, safePath);
    assertFileSize(BigInt(bytes.length), safePath, maxFileBytes);
    try {
      return new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes);
    } catch {
      throw new InputFailure(
        "filesystem",
        "file.encoding_invalid",
        `Project file ${JSON.stringify(safePath)} must be valid UTF-8.`,
        safePath,
      );
    }
  } catch (error) {
    primaryError = error;
    if (error instanceof InputFailure) {
      throw error;
    }
    throw filesystemFailure(
      error,
      "file.unreadable",
      `Cannot read project file ${JSON.stringify(safePath)}.`,
      safePath,
    );
  } finally {
    if (handle !== undefined) {
      try {
        await handle.close();
      } catch (error) {
        if (primaryError === undefined) {
          throw filesystemFailure(
            error,
            "file.unreadable",
            `Cannot close project file ${JSON.stringify(safePath)}.`,
            safePath,
          );
        }
      }
    }
  }
}

async function readBounded(
  handle: ProjectFileHandle,
  maxFileBytes: number,
): Promise<Buffer> {
  const bytes = Buffer.alloc(maxFileBytes + 1);
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesRead } = await handle.read(
      bytes,
      offset,
      bytes.length - offset,
      offset,
    );
    if (bytesRead === 0) {
      break;
    }
    offset += bytesRead;
  }
  return bytes.subarray(0, offset);
}

function assertFileSize(size: bigint, safePath: string, maxFileBytes: number): void {
  if (size > BigInt(maxFileBytes)) {
    throw new InputFailure(
      "filesystem",
      "file.size_limit_exceeded",
      `Project file ${JSON.stringify(safePath)} exceeds the configured limit of ${maxFileBytes} bytes.`,
      safePath,
    );
  }
}

function assertRegularFile(stats: ProjectFileStat, safePath: string): void {
  if (stats.isSymbolicLink()) {
    throw new InputFailure(
      "filesystem",
      "path.symlink_forbidden",
      `Project path ${JSON.stringify(safePath)} is a symlink.`,
      safePath,
    );
  }
  if (!stats.isFile()) {
    throw new InputFailure(
      "filesystem",
      "path.not_file",
      `Project path ${JSON.stringify(safePath)} has the wrong filesystem type.`,
      safePath,
    );
  }
}

function assertStableFile(
  before: ProjectFileStat,
  after: ProjectFileStat,
  pathAfter: ProjectFileStat,
  safePath: string,
): void {
  assertRegularFile(pathAfter, safePath);
  if (
    !sameIdentity(before, after) ||
    !sameIdentity(after, pathAfter) ||
    before.size !== after.size ||
    before.mtimeNs !== after.mtimeNs ||
    before.ctimeNs !== after.ctimeNs
  ) {
    throw new InputFailure(
      "filesystem",
      "file.changed_during_read",
      `Project file ${JSON.stringify(safePath)} changed while it was being read.`,
      safePath,
    );
  }
}

function sameIdentity(left: ProjectFileStat, right: ProjectFileStat): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

async function assertParentPathHasNoSymlink(
  root: string,
  relativePath: string,
  operations: ProjectFileOperations,
): Promise<void> {
  const segments = relativePath.split("/");
  for (let index = 0; index < segments.length - 1; index += 1) {
    const current = segments.slice(0, index + 1).join("/");
    let stats;
    try {
      stats = await operations.lstat(fromProjectPath(root, current));
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
    if (!stats.isDirectory()) {
      throw new InputFailure(
        "filesystem",
        "path.not_directory",
        `Project path ${JSON.stringify(current)} must be a directory.`,
        current,
      );
    }
  }
}

export async function discoverProjectFiles(
  root: string,
  sourceRoot: string,
  maxFiles: number,
  maxTotalBytes: number,
  maxDepth: number,
): Promise<readonly string[]> {
  const safeSourceRoot = assertRelativePosixPath(sourceRoot, "sourceRoot");
  await assertPathHasNoSymlink(root, safeSourceRoot, true);
  const files: string[] = [];
  let totalBytes = 0;

  async function visit(relativeDirectory: string, depth: number): Promise<void> {
    if (depth > maxDepth) {
      throw new InputFailure(
        "filesystem",
        "discovery.depth_limit_exceeded",
        `Source discovery exceeded the configured directory depth limit of ${maxDepth}.`,
        relativeDirectory,
      );
    }
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
        await visit(relativeEntry, depth + 1);
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
        let stats;
        try {
          stats = await lstat(fromProjectPath(root, relativeEntry));
        } catch (error) {
          throw filesystemFailure(
            error,
            "file.unreadable",
            `Cannot inspect project file ${JSON.stringify(relativeEntry)}.`,
            relativeEntry,
          );
        }
        totalBytes += stats.size;
        if (totalBytes > maxTotalBytes) {
          throw new InputFailure(
            "filesystem",
            "discovery.total_bytes_limit_exceeded",
            `Source discovery exceeded the configured total byte limit of ${maxTotalBytes}.`,
            safeSourceRoot,
          );
        }
      }
    }
  }

  await visit(safeSourceRoot, 0);
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
