import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  releaseArtifactFileName,
  releasePackageNames,
} from "./pack-release-artifacts.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const options = parseOptions(process.argv.slice(2));
const workspace = await readJson("package.json");
const packages = [
  ["@0disoft/mensor-contract", "packages/contract/package.json"],
  ["@0disoft/mensor-compiler", "packages/compiler/package.json"],
  ["@0disoft/mensor-cli", "packages/cli/package.json"],
];
const failures = [];

if (!isStrictSemver(workspace.version)) {
  failures.push(`Workspace version ${JSON.stringify(workspace.version)} is not strict semver.`);
}
if (options.version !== undefined && options.version !== workspace.version) {
  failures.push(
    `Requested release version ${options.version} does not match workspace version ${workspace.version}.`,
  );
}
if (options.tag !== undefined && !["latest", "next"].includes(options.tag)) {
  failures.push(`Unsupported npm dist-tag ${JSON.stringify(options.tag)}.`);
}

for (const [expectedName, manifestPath] of packages) {
  const manifest = await readJson(manifestPath);
  if (manifest.name !== expectedName) {
    failures.push(`${manifestPath} must declare ${expectedName}.`);
  }
  if (manifest.version !== workspace.version) {
    failures.push(`${expectedName} version must match workspace version ${workspace.version}.`);
  }
  if (manifest.private === true) {
    failures.push(`${expectedName} is still private.`);
  }
  if (
    manifest.publishConfig?.access !== "public" ||
    manifest.publishConfig?.registry !== "https://registry.npmjs.org" ||
    manifest.publishConfig?.provenance !== true
  ) {
    failures.push(`${expectedName} has an incomplete public publication contract.`);
  }
  if (manifest.license !== "Apache-2.0" || !manifest.files?.includes("LICENSE")) {
    failures.push(`${expectedName} must package its Apache-2.0 license.`);
  }
}

const changelog = await readText("CHANGELOG.md");
if (!changelog.includes(`## [${workspace.version}]`)) {
  failures.push(`CHANGELOG.md must contain a ${workspace.version} release heading.`);
}
const migrationPath = `docs/releasing/${workspace.version}.md`;
const migration = await readText(migrationPath);
for (const packageName of packages.map(([name]) => name)) {
  if (!migration.includes(packageName)) {
    failures.push(`${migrationPath} must name ${packageName}.`);
  }
}

const runbook = await readText("docs/releasing/runbook.md");
for (const packageName of releasePackageNames) {
  const artifact = releaseArtifactFileName(packageName, workspace.version);
  const bootstrapCommand =
    `npm publish ./dist/release/${artifact} --access public --tag latest --provenance=false`;
  if (!runbook.includes(bootstrapCommand)) {
    failures.push(`runbook.md must contain the local bootstrap command ${JSON.stringify(bootstrapCommand)}.`);
  }
}
for (const required of [
  "npm stage list",
  "npm stage view",
  "npm stage download",
  "npm stage approve",
  "Node 22.14.0",
  "npm 11.15.0",
]) {
  if (!runbook.includes(required)) {
    failures.push(`runbook.md must contain ${JSON.stringify(required)}.`);
  }
}

const workflow = await readText(".github/workflows/release.yml");
for (const required of [
  "workflow_dispatch:",
  "contents: read",
  "id-token: write",
  "environment: npm-release",
  "node-version: 24",
  "npm@11.18.0",
  "npm stage publish",
]) {
  if (!workflow.includes(required)) {
    failures.push(`release.yml must contain ${JSON.stringify(required)}.`);
  }
}
for (const packageName of releasePackageNames) {
  const artifact = releaseArtifactFileName(packageName, workspace.version);
  if (!workflow.includes(artifact.replace(workspace.version, "${{ inputs.version }}"))) {
    failures.push(`release.yml must stage ${artifact}.`);
  }
}
for (const [description, pattern] of [
  ["a long-lived npm token", /NODE_AUTH_TOKEN|NPM_TOKEN|secrets\./u],
  ["direct npm publish", /(^|\s)npm publish(\s|$)/mu],
  ["a disabled provenance override", /--provenance=false/u],
  ["an automatic push trigger", /^\s*push\s*:/mu],
  ["an automatic pull-request trigger", /^\s*pull_request\s*:/mu],
]) {
  if (pattern.test(workflow)) {
    failures.push(`release.yml must not contain ${description}.`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}

function parseOptions(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option !== "--version" && option !== "--tag") {
      throw new Error(`Unknown release-check option ${JSON.stringify(option)}.`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${option} requires a value.`);
    }
    const key = option.slice(2);
    if (parsed[key] !== undefined) {
      throw new Error(`${option} may be supplied only once.`);
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function isStrictSemver(value) {
  return typeof value === "string" && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/u.test(value);
}

async function readJson(path) {
  return JSON.parse(await readText(path));
}

async function readText(path) {
  return readFile(resolve(root, path), "utf8");
}
