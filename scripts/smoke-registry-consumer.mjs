import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const registry = "https://registry.npmjs.org/";
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const workspace = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
);
const version = workspace.version;
const packageNames = [
  "@0disoft/mensor-contract",
  "@0disoft/mensor-compiler",
  "@0disoft/mensor-cli",
];
const packageManagerEntrypoint = process.env.npm_execpath;

if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) {
  throw new Error("The workspace version must be strict semver.");
}
if (
  packageManagerEntrypoint === undefined ||
  packageManagerEntrypoint.length === 0
) {
  throw new Error("Registry smoke must be run through the configured pnpm script.");
}

const packageManagerIsExecutable =
  path.extname(packageManagerEntrypoint).toLowerCase() === ".exe";
const temporaryRoot = await mkdtemp(
  path.join(tmpdir(), "mensor-registry-smoke-"),
);
const consumerRoot = path.join(temporaryRoot, "consumer");
const storeRoot = path.join(temporaryRoot, "pnpm-store");
const npmUserConfig = path.join(temporaryRoot, "empty.npmrc");

try {
  await mkdir(consumerRoot, { recursive: true });
  await writeFile(npmUserConfig, "", "utf8");
  await writeFile(
    path.join(consumerRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "mensor-registry-smoke-consumer",
        private: true,
        type: "module",
        packageManager: workspace.packageManager,
        dependencies: Object.fromEntries(
          packageNames.map((packageName) => [packageName, version]),
        ),
        pnpm: {
          overrides: Object.fromEntries(
            packageNames.map((packageName) => [packageName, version]),
          ),
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    path.join(consumerRoot, "pnpm-workspace.yaml"),
    'packages:\n  - "."\n',
    "utf8",
  );
  await writeFile(
    path.join(consumerRoot, "contract-smoke.mjs"),
    `import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCheckOutputV2, parseRouteIndex, serializeRouteIndex } from "@0disoft/mensor-contract";

const text = serializeRouteIndex({
  schemaVersion: 1,
  producer: { name: "registry-smoke", version: "1.0.0" },
  routes: [{
    method: "POST",
    path: "/smoke",
    source: {
      file: "src/routes.mjs",
      contentDigest: "sha256:${"0".repeat(64)}",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 }
      }
    }
  }]
});
assert.equal(parseRouteIndex(text).ok, true);
assert.equal(parseCheckOutputV2(JSON.stringify({
  schemaVersion: 2,
  producer: { name: "mensor", version: "${version}" },
  status: "passed",
  inspection: {
    filePlacement: { state: "checked", basis: "file-roles" },
    forms: { state: "checked", basis: "static-html-form-index" },
    handlers: { state: "checked", basis: "static-module-facts" },
    moduleBoundaries: { state: "not-configured", basis: "module-graph" },
    ownership: { state: "not-configured", basis: "ownership-rules" },
    routes: { state: "not-configured", basis: "route-index" },
    runtimeSemantics: { state: "out-of-scope", basis: "none" }
  },
  diagnostics: [],
  summary: { errorCount: 0, warningCount: 0 }
})).ok, true);
const schemaUrl = import.meta.resolve(
  "@0disoft/mensor-contract/schemas/route-index-v1.schema.json"
);
const schema = JSON.parse(await readFile(new URL(schemaUrl), "utf8"));
assert.equal(schema.$id, "route-index-v1.schema.json");
const checkOutputSchemaUrl = import.meta.resolve(
  "@0disoft/mensor-contract/schemas/check-output-v2.schema.json"
);
const checkOutputSchema = JSON.parse(
  await readFile(new URL(checkOutputSchemaUrl), "utf8")
);
assert.equal(checkOutputSchema.$id, "check-output-v2.schema.json");
`,
    "utf8",
  );

  await cp(
    path.join(repositoryRoot, "fixtures", "valid", "tiny-tasks"),
    path.join(consumerRoot, "valid"),
    { recursive: true },
  );
  await cp(
    path.join(repositoryRoot, "fixtures", "invalid", "form-field-missing"),
    path.join(consumerRoot, "invalid"),
    { recursive: true },
  );

  await runPackageManager(
    [
      "install",
      "--ignore-scripts",
      "--lockfile=false",
      "--prefer-offline=false",
      `--registry=${registry}`,
      `--store-dir=${storeRoot}`,
    ],
    consumerRoot,
  );

  const rootLicense = await readFile(path.join(repositoryRoot, "LICENSE"), "utf8");
  const packages = [];
  for (const packageName of packageNames) {
    const installedPackageRoot = path.join(
      consumerRoot,
      "node_modules",
      ...packageName.split("/"),
    );
    const packageLink = await lstat(installedPackageRoot);
    assert.equal(
      packageLink.isSymbolicLink() || packageLink.isDirectory(),
      true,
      `${packageName} must be installed in the isolated consumer`,
    );
    const installedRealPath = await realpath(installedPackageRoot);
    assert.equal(
      isWithin(temporaryRoot, installedRealPath),
      true,
      `${packageName} must not resolve into the source repository`,
    );
    const packageMetadata = JSON.parse(
      await readFile(path.join(installedPackageRoot, "package.json"), "utf8"),
    );
    assert.equal(packageMetadata.name, packageName);
    assert.equal(packageMetadata.version, version);
    assert.notEqual(packageMetadata.private, true);
    assert.equal(
      await readFile(path.join(installedPackageRoot, "LICENSE"), "utf8"),
      rootLicense,
    );
    packages.push({ name: packageName, version: packageMetadata.version });
  }

  await run(process.execPath, ["contract-smoke.mjs"], consumerRoot);
  const cliEntrypoint = path.join(
    consumerRoot,
    "node_modules",
    "@0disoft",
    "mensor-cli",
    "dist",
    "src",
    "bin.js",
  );
  const valid = await capture(
    process.execPath,
    [cliEntrypoint, "check", "valid", "--json"],
    consumerRoot,
  );
  assert.equal(valid.code, 0, valid.stderr);
  assert.equal(JSON.parse(valid.stdout).status, "passed");

  const validV2 = await capture(
    process.execPath,
    [cliEntrypoint, "check", "valid", "--json", "--report-version", "2"],
    consumerRoot,
  );
  assert.equal(validV2.code, 0, validV2.stderr);
  const validV2Report = JSON.parse(validV2.stdout);
  assert.equal(validV2Report.schemaVersion, 2);
  assert.equal(validV2Report.inspection.routes.state, "not-configured");

  const invalid = await capture(
    process.execPath,
    [cliEntrypoint, "check", "invalid", "--json"],
    consumerRoot,
  );
  assert.equal(invalid.code, 1, invalid.stderr);
  const invalidReport = JSON.parse(invalid.stdout);
  assert.equal(invalidReport.status, "failed");
  assert.deepEqual(
    invalidReport.diagnostics.map((diagnostic) => diagnostic.code),
    ["form.field_missing"],
  );

  const invalidV2 = await capture(
    process.execPath,
    [cliEntrypoint, "check", "invalid", "--json", "--report-version=2"],
    consumerRoot,
  );
  assert.equal(invalidV2.code, 1, invalidV2.stderr);
  const invalidV2Report = JSON.parse(invalidV2.stdout);
  assert.equal(invalidV2Report.schemaVersion, 2);
  assert.equal(invalidV2Report.inspection.forms.state, "checked");

  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        kind: "public-registry-consumer-smoke",
        registry,
        packages,
        contractImport: "passed",
        validProjectStatus: "passed",
        invalidProjectStatus: "failed",
        invalidDiagnosticCodes: ["form.field_missing"],
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative.length > 0 &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function runPackageManager(args, cwd) {
  return run(
    packageManagerIsExecutable ? packageManagerEntrypoint : process.execPath,
    [
      ...(packageManagerIsExecutable ? [] : [packageManagerEntrypoint]),
      ...args,
    ],
    cwd,
  );
}

async function run(command, args, cwd) {
  const result = await capture(command, args, cwd);
  if (result.code !== 0) {
    throw new Error(
      `${path.basename(command)} failed with exit code ${result.code}.\n` +
        `${result.stdout}${result.stderr}`,
    );
  }
}

async function capture(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        CI: "1",
        NPM_CONFIG_USERCONFIG: npmUserConfig,
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}
