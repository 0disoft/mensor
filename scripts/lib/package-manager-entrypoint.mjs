import path from "node:path";

export function isPackageManagerExecutable(entrypoint) {
  // pnpm ships native extensionless binaries on Unix and .exe binaries on Windows.
  return ![".js", ".cjs", ".mjs"].includes(path.extname(entrypoint).toLowerCase());
}
