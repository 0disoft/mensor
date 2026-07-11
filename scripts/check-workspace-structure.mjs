import { readFile } from "node:fs/promises";

const workspace = await json("../package.json");
const contract = await json("../packages/contract/package.json");
const compiler = await json("../packages/compiler/package.json");
const cli = await json("../packages/cli/package.json");
const failures = [];

if (workspace.private !== true) {
  failures.push("The workspace root must remain private.");
}
if (contract.private !== true) {
  failures.push("The contract package must remain private before preview release.");
}
if (compiler.private !== true) {
  failures.push("The compiler package must remain private before preview release.");
}
if (cli.private !== true) {
  failures.push("The CLI package must remain private before preview release.");
}
if (Object.hasOwn(workspace, "dependencies")) {
  failures.push("Runtime dependencies belong to the package that imports them, not the workspace root.");
}
for (const dependency of ["ajv", "jsonc-parser"]) {
  if (typeof contract.dependencies?.[dependency] !== "string") {
    failures.push(`@mensor/contract must declare ${dependency}.`);
  }
}
if (compiler.dependencies?.["@mensor/contract"] !== "workspace:*") {
  failures.push("@mensor/compiler must use the public workspace contract package.");
}
if (compiler.dependencies?.["jsonc-parser"] !== "3.3.1") {
  failures.push("@mensor/compiler must declare its direct jsonc-parser dependency.");
}
if (compiler.dependencies?.["parse5"] !== "8.0.1") {
  failures.push("@mensor/compiler must declare its direct parse5 dependency.");
}
if (compiler.dependencies?.["@typescript/typescript6"] !== "6.0.2") {
  failures.push("@mensor/compiler must declare its direct TypeScript parser dependency.");
}
if (cli.dependencies?.["@mensor/compiler"] !== "workspace:*") {
  failures.push("@mensor/cli must use the public workspace compiler package.");
}
if (cli.bin?.mensor !== "./dist/src/bin.js") {
  failures.push("@mensor/cli must expose the built mensor executable.");
}
if (
  workspace.version !== contract.version ||
  workspace.version !== compiler.version ||
  workspace.version !== cli.version
) {
  failures.push("All private workspace packages must use one fixed version.");
}
for (const forbidden of ["preinstall", "install", "postinstall", "prepare"]) {
  if (
    workspace.scripts?.[forbidden] !== undefined ||
    contract.scripts?.[forbidden] !== undefined ||
    compiler.scripts?.[forbidden] !== undefined ||
    cli.scripts?.[forbidden] !== undefined
  ) {
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
