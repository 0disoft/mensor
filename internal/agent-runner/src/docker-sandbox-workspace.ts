import * as path from "node:path";

export function validateDockerSandboxWorkspaceRoot(value: string): string {
  if (!path.isAbsolute(value) || value.includes("\0") || value.includes(",")) {
    throw new Error(
      "Docker sandbox workspace root must be an absolute path without NUL or comma.",
    );
  }
  return path.resolve(value);
}
