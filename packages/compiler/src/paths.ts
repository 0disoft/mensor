import * as path from "node:path";

export function assertRelativePosixPath(value: string, label: string): string {
  if (value.length === 0 || value.includes("\\") || path.posix.isAbsolute(value)) {
    throw new InputFailure(
      "configuration",
      "path.invalid",
      `${label} must be a non-empty project-relative POSIX path.`,
      value,
    );
  }

  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new InputFailure(
      "configuration",
      "path.invalid",
      `${label} contains an empty, current-directory, or parent-directory segment.`,
      value,
    );
  }

  return segments.join("/");
}

export function fromProjectPath(root: string, relativePath: string): string {
  return path.join(root, ...relativePath.split("/"));
}

export function joinProjectPath(...parts: readonly string[]): string {
  return parts.filter((part) => part !== "." && part !== "").join("/");
}

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export class InputFailure extends Error {
  readonly kind: "configuration" | "filesystem";
  readonly code: string;
  readonly file?: string;

  constructor(
    kind: "configuration" | "filesystem",
    code: string,
    message: string,
    file?: string,
  ) {
    super(message);
    this.name = "InputFailure";
    this.kind = kind;
    this.code = code;
    if (file !== undefined) {
      this.file = file;
    }
  }
}
