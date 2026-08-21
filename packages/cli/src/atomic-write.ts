import { lstat, mkdir, open, realpath, rename, rm } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import * as path from "node:path";

import type { CompilerFailure } from "@0disoft/mensor-compiler";

interface ValidOutputPath {
  readonly ok: true;
  readonly path: string;
}

interface InvalidOutputPath {
  readonly ok: false;
  readonly failure: CompilerFailure;
}

export type OutputPathValidation = ValidOutputPath | InvalidOutputPath;

interface AtomicWriteSuccess {
  readonly ok: true;
}

interface AtomicWriteFailure {
  readonly ok: false;
  readonly failure: CompilerFailure;
}

export type AtomicWriteResult = AtomicWriteSuccess | AtomicWriteFailure;

class OutputConfigurationError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OutputConfigurationError";
  }
}

export function validateProjectOutputPath(value: string): OutputPathValidation {
  const segments = value.split("/");
  if (
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("\u0000") ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    /^[A-Za-z]:/u.test(value) ||
    segments.some((segment) =>
      segment.length === 0 || segment === "." || segment === ".."
    )
  ) {
    return {
      ok: false,
      failure: {
        kind: "configuration",
        code: "cli.output_path_invalid",
        message:
          "--output must be a non-empty project-relative POSIX file path without empty, current-directory, or parent-directory segments.",
      },
    };
  }
  return { ok: true, path: value };
}

export async function writeProjectFileAtomically(
  root: string,
  relativePath: string,
  content: string,
): Promise<AtomicWriteResult> {
  let temporaryPath: string | undefined;
  let handle: FileHandle | undefined;
  try {
    const rootRealPath = await realpath(path.resolve(root));
    const segments = relativePath.split("/");
    const fileName = segments.at(-1);
    if (fileName === undefined) {
      throw new OutputConfigurationError(
        "cli.output_path_invalid",
        "--output must identify one file.",
      );
    }
    const directory = await resolveOutputDirectory(
      rootRealPath,
      segments.slice(0, -1),
    );
    const outputPath = path.join(directory, fileName);
    const existing = await lstatIfPresent(outputPath);
    if (existing?.isDirectory() === true) {
      throw new OutputConfigurationError(
        "cli.output_is_directory",
        "--output identifies an existing directory.",
      );
    }
    if (existing?.isSymbolicLink() === true) {
      throw new OutputConfigurationError(
        "cli.output_is_symlink",
        "--output must not replace a symbolic link.",
      );
    }
    if (existing !== undefined && !existing.isFile()) {
      throw new OutputConfigurationError(
        "cli.output_not_regular_file",
        "--output must identify a regular file.",
      );
    }

    const temporary = await openTemporaryFile(directory);
    temporaryPath = temporary.path;
    handle = temporary.handle;
    await handle.writeFile(content, { encoding: "utf8" });
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, outputPath);
    temporaryPath = undefined;
    return { ok: true };
  } catch (error) {
    if (error instanceof OutputConfigurationError) {
      return {
        ok: false,
        failure: {
          kind: "configuration",
          code: error.code,
          message: error.message,
          file: relativePath,
        },
      };
    }
    return {
      ok: false,
      failure: {
        kind: "filesystem",
        code: "cli.output_write_failed",
        message: "The runtime manifest could not be written atomically.",
        file: relativePath,
      },
    };
  } finally {
    if (handle !== undefined) {
      await handle.close().catch(() => undefined);
    }
    if (temporaryPath !== undefined) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}

async function resolveOutputDirectory(
  rootRealPath: string,
  segments: readonly string[],
): Promise<string> {
  let current = rootRealPath;
  for (const segment of segments) {
    const candidate = path.join(current, segment);
    let status = await lstatIfPresent(candidate);
    if (status === undefined) {
      try {
        await mkdir(candidate);
      } catch (error) {
        if (nodeErrorCode(error) !== "EEXIST") {
          throw error;
        }
      }
      status = await lstat(candidate);
    }
    if (status.isSymbolicLink()) {
      const resolved = await realpath(candidate);
      if (!isInside(rootRealPath, resolved)) {
        throw new OutputConfigurationError(
          "cli.output_outside_root",
          "--output resolves outside the selected project root.",
        );
      }
      const resolvedStatus = await lstat(resolved);
      if (!resolvedStatus.isDirectory()) {
        throw new OutputConfigurationError(
          "cli.output_parent_not_directory",
          "A parent segment of --output is not a directory.",
        );
      }
      current = resolved;
      continue;
    }
    if (!status.isDirectory()) {
      throw new OutputConfigurationError(
        "cli.output_parent_not_directory",
        "A parent segment of --output is not a directory.",
      );
    }
    current = candidate;
  }
  return current;
}

async function openTemporaryFile(
  directory: string,
): Promise<{ readonly path: string; readonly handle: FileHandle }> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const temporaryPath = path.join(
      directory,
      `.mensor-output-${process.pid}-${attempt}.tmp`,
    );
    try {
      return {
        path: temporaryPath,
        handle: await open(temporaryPath, "wx", 0o666),
      };
    } catch (error) {
      if (nodeErrorCode(error) !== "EEXIST") {
        throw error;
      }
    }
  }
  throw new Error("No temporary output path was available.");
}

async function lstatIfPresent(
  filePath: string,
): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (
    !path.isAbsolute(relative) &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".."
  );
}

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const code = Reflect.get(error, "code");
  return typeof code === "string" ? code : undefined;
}
