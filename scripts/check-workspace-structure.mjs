import { readFile } from "node:fs/promises";

const workspace = await json("../package.json");
const contract = await json("../packages/contract/package.json");
const failures = [];

if (workspace.private !== true) {
  failures.push("The workspace root must remain private.");
}
if (contract.private !== true) {
  failures.push("The contract package must remain private before preview release.");
}
if (Object.hasOwn(workspace, "dependencies")) {
  failures.push("Runtime dependencies belong to the package that imports them, not the workspace root.");
}
for (const dependency of ["ajv", "jsonc-parser"]) {
  if (typeof contract.dependencies?.[dependency] !== "string") {
    failures.push(`@mensor/contract must declare ${dependency}.`);
  }
}
for (const forbidden of ["preinstall", "install", "postinstall", "prepare"]) {
  if (workspace.scripts?.[forbidden] !== undefined || contract.scripts?.[forbidden] !== undefined) {
    failures.push(`Lifecycle script ${forbidden} is forbidden.`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}

async function json(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));
}
