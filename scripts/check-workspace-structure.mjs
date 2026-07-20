import { readFile } from "node:fs/promises";

const workspace = await json("../package.json");
const contract = await json("../packages/contract/package.json");
const compiler = await json("../packages/compiler/package.json");
const cli = await json("../packages/cli/package.json");
const fixtureKit = await json("../internal/fixture-kit/package.json");
const agentRunner = await json("../internal/agent-runner/package.json");
const rootLicense = await readFile(new URL("../LICENSE", import.meta.url), "utf8");
const failures = [];

if (workspace.private !== true) {
  failures.push("The workspace root must remain private.");
}
if (workspace.license !== "Apache-2.0") {
  failures.push("The workspace must declare Apache-2.0.");
}
if (fixtureKit.private !== true) {
  failures.push("The fixture kit must remain an internal private package.");
}
if (agentRunner.private !== true) {
  failures.push("The agent runner must remain an internal private package.");
}
if (Object.hasOwn(workspace, "dependencies")) {
  failures.push("Runtime dependencies belong to the package that imports them, not the workspace root.");
}
for (const dependency of ["ajv", "jsonc-parser"]) {
  if (typeof contract.dependencies?.[dependency] !== "string") {
    failures.push(`@0disoft/mensor-contract must declare ${dependency}.`);
  }
}
if (compiler.dependencies?.["@0disoft/mensor-contract"] !== "workspace:*") {
  failures.push("@0disoft/mensor-compiler must use the public workspace contract package.");
}
if (compiler.dependencies?.["jsonc-parser"] !== "3.3.1") {
  failures.push("@0disoft/mensor-compiler must declare its direct jsonc-parser dependency.");
}
if (compiler.dependencies?.["parse5"] !== "8.0.1") {
  failures.push("@0disoft/mensor-compiler must declare its direct parse5 dependency.");
}
if (compiler.dependencies?.["@typescript/typescript6"] !== "6.0.2") {
  failures.push("@0disoft/mensor-compiler must declare its direct TypeScript parser dependency.");
}
if (cli.dependencies?.["@0disoft/mensor-compiler"] !== "workspace:*") {
  failures.push("@0disoft/mensor-cli must use the public workspace compiler package.");
}
if (fixtureKit.dependencies?.["@0disoft/mensor-compiler"] !== "workspace:*") {
  failures.push("@mensor/fixture-kit must use the public workspace compiler package.");
}
if (fixtureKit.dependencies?.["@0disoft/mensor-contract"] !== "workspace:*") {
  failures.push("@mensor/fixture-kit must declare its direct diagnostic contract dependency.");
}
if (agentRunner.dependencies?.["@mensor/fixture-kit"] !== "workspace:*") {
  failures.push("@mensor/agent-runner must use the private workspace fixture kit.");
}
if (agentRunner.dependencies?.["@0disoft/mensor-contract"] !== "workspace:*") {
  failures.push("@mensor/agent-runner must declare its direct diagnostic validator dependency.");
}
if (agentRunner.exports?.["."]?.import !== "./dist/src/index.js") {
  failures.push("@mensor/agent-runner must expose only its built root entrypoint.");
}
if (agentRunner.exports?.["."]?.types !== "./dist/src/index.d.ts") {
  failures.push("@mensor/agent-runner must expose its built root type declarations.");
}
if (agentRunner.devDependencies?.ajv !== "8.20.0") {
  failures.push("@mensor/agent-runner must declare the schema validator used by its tests.");
}
if (cli.bin?.mensor !== "./dist/src/bin.js") {
  failures.push("@0disoft/mensor-cli must expose the built mensor executable.");
}
for (const [manifest, expectedName, directory] of [
  [contract, "@0disoft/mensor-contract", "packages/contract"],
  [compiler, "@0disoft/mensor-compiler", "packages/compiler"],
  [cli, "@0disoft/mensor-cli", "packages/cli"],
]) {
  if (manifest.name !== expectedName) {
    failures.push(`${directory} must use package name ${expectedName}.`);
  }
  if (manifest.license !== "Apache-2.0") {
    failures.push(`${expectedName} must declare Apache-2.0.`);
  }
  if (manifest.private === true) {
    failures.push(`${expectedName} must remain publishable.`);
  }
  if (manifest.publishConfig?.access !== "public") {
    failures.push(`${expectedName} must publish with public access.`);
  }
  if (manifest.publishConfig?.registry !== "https://registry.npmjs.org") {
    failures.push(`${expectedName} must publish only to the public npm registry.`);
  }
  if (manifest.publishConfig?.provenance !== true) {
    failures.push(`${expectedName} must request npm provenance.`);
  }
  if (typeof manifest.description !== "string" || manifest.description.length === 0) {
    failures.push(`${expectedName} must declare a description.`);
  }
  if (manifest.repository?.url !== "git+https://github.com/0disoft/mensor.git") {
    failures.push(`${expectedName} must declare the canonical repository URL.`);
  }
  if (manifest.repository?.directory !== directory) {
    failures.push(`${expectedName} must declare its monorepo directory.`);
  }
  if (manifest.homepage !== "https://github.com/0disoft/mensor#readme") {
    failures.push(`${expectedName} must declare the canonical homepage.`);
  }
  if (manifest.bugs?.url !== "https://github.com/0disoft/mensor/issues") {
    failures.push(`${expectedName} must declare the canonical issue tracker.`);
  }
  if (!manifest.files?.includes("LICENSE")) {
    failures.push(`${expectedName} must include its license in package artifacts.`);
  }
  const packageLicense = await readFile(new URL(`../${directory}/LICENSE`, import.meta.url), "utf8");
  if (packageLicense !== rootLicense) {
    failures.push(`${expectedName} license text must match the repository license.`);
  }
}
if (
  workspace.version !== contract.version ||
  workspace.version !== compiler.version ||
  workspace.version !== cli.version ||
  workspace.version !== fixtureKit.version ||
  workspace.version !== agentRunner.version
) {
  failures.push("All workspace packages must use one fixed version.");
}
for (const forbidden of ["preinstall", "install", "postinstall", "prepare"]) {
  if (
    workspace.scripts?.[forbidden] !== undefined ||
    contract.scripts?.[forbidden] !== undefined ||
    compiler.scripts?.[forbidden] !== undefined ||
    cli.scripts?.[forbidden] !== undefined ||
    fixtureKit.scripts?.[forbidden] !== undefined ||
    agentRunner.scripts?.[forbidden] !== undefined
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
