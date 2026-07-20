import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const temporaryRoot = await mkdtemp(path.join(tmpdir(), "mensor-package-smoke-"));
const tarballRoot = path.join(temporaryRoot, "tarballs");
const consumerRoot = path.join(temporaryRoot, "consumer");
const pnpmEntrypoint = process.env.npm_execpath;
if (pnpmEntrypoint === undefined || pnpmEntrypoint.length === 0) {
  throw new Error("Package smoke must be run through the configured pnpm script.");
}
const pnpmExecutable = path.extname(pnpmEntrypoint).toLowerCase() === ".exe";

try {
  await mkdir(consumerRoot, { recursive: true });
  const packageNames = ["contract", "compiler", "cli"];
  for (const packageName of packageNames) {
    await assertBuildOutputMatchesSource(packageName);
    await run(
      pnpmExecutable ? pnpmEntrypoint : process.execPath,
      [
        ...(pnpmExecutable ? [] : [pnpmEntrypoint]),
        "--filter",
        `@0disoft/mensor-${packageName}`,
        "pack",
        "--pack-destination",
        tarballRoot,
      ],
      repositoryRoot,
    );
  }

  const tarballs = Object.fromEntries(
    await Promise.all(
      packageNames.map(async (packageName) => {
        const packageJson = JSON.parse(
          await readFile(
            path.join(repositoryRoot, "packages", packageName, "package.json"),
            "utf8",
          ),
        );
        const tarballName = `0disoft-mensor-${packageName}-${packageJson.version}.tgz`;
        return [packageName, path.join(tarballRoot, tarballName)];
      }),
    ),
  );

  await writeFile(
    path.join(consumerRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "mensor-package-smoke-consumer",
        private: true,
        type: "module",
        dependencies: {
          "@0disoft/mensor-contract": tarballDependency(tarballs.contract),
          "@0disoft/mensor-compiler": tarballDependency(tarballs.compiler),
          "@0disoft/mensor-cli": tarballDependency(tarballs.cli),
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    path.join(consumerRoot, "pnpm-workspace.yaml"),
    [
      "packages:",
      '  - "."',
      "overrides:",
      `  "@0disoft/mensor-contract": "${tarballDependency(tarballs.contract)}"`,
      `  "@0disoft/mensor-compiler": "${tarballDependency(tarballs.compiler)}"`,
      `  "@0disoft/mensor-cli": "${tarballDependency(tarballs.cli)}"`,
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(consumerRoot, "contract-smoke.mjs"),
    `import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseRouteIndex, serializeRouteIndex } from "@0disoft/mensor-contract";

const text = serializeRouteIndex({
  schemaVersion: 1,
  producer: { name: "package-smoke", version: "1.0.0" },
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
const schemaUrl = import.meta.resolve(
  "@0disoft/mensor-contract/schemas/route-index-v1.schema.json"
);
const schema = JSON.parse(await readFile(new URL(schemaUrl), "utf8"));
assert.equal(schema.$id, "route-index-v1.schema.json");
`,
    "utf8",
  );

  await cp(path.join(repositoryRoot, "fixtures", "valid", "tiny-tasks"), path.join(consumerRoot, "valid"), {
    recursive: true,
  });
  await cp(
    path.join(repositoryRoot, "fixtures", "invalid", "form-field-missing"),
    path.join(consumerRoot, "invalid"),
    { recursive: true },
  );

  await runPnpm(["install", "--prefer-offline", "--ignore-scripts"], consumerRoot);
  const rootLicense = await readFile(path.join(repositoryRoot, "LICENSE"), "utf8");
  for (const packageName of packageNames) {
    const installedPackageRoot = path.join(
      consumerRoot,
      "node_modules",
      "@0disoft",
      `mensor-${packageName}`,
    );
    const packageLicense = await readFile(path.join(installedPackageRoot, "LICENSE"), "utf8");
    assert.equal(packageLicense, rootLicense);
    const packageMetadata = JSON.parse(
      await readFile(path.join(installedPackageRoot, "package.json"), "utf8"),
    );
    assert.notEqual(packageMetadata.private, true);
    assert.deepEqual(packageMetadata.publishConfig, {
      access: "public",
      registry: "https://registry.npmjs.org",
      provenance: true,
    });
  }
  await run(process.execPath, ["contract-smoke.mjs"], consumerRoot);

  const valid = await runMensor(consumerRoot, "valid");
  assert.equal(valid.code, 0, valid.stderr);
  assert.equal(JSON.parse(valid.stdout).status, "passed");

  const invalid = await runMensor(consumerRoot, "invalid");
  assert.equal(invalid.code, 1, invalid.stderr);
  const invalidReport = JSON.parse(invalid.stdout);
  assert.equal(invalidReport.status, "failed");
  assert.deepEqual(
    invalidReport.diagnostics.map((diagnostic) => diagnostic.code),
    ["form.field_missing"],
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function assertBuildOutputMatchesSource(packageName) {
  const packageRoot = path.join(repositoryRoot, "packages", packageName);
  const sourceFiles = (await listFiles(path.join(packageRoot, "src")))
    .filter((file) => file.endsWith(".ts"));
  const expected = new Set(sourceFiles.flatMap((file) => {
    const stem = file.slice(0, -3);
    return [
      `${stem}.d.ts`,
      `${stem}.d.ts.map`,
      `${stem}.js`,
      `${stem}.js.map`,
    ];
  }));
  const actual = new Set(await listFiles(path.join(packageRoot, "dist", "src")));
  assert.deepEqual(
    [...actual].sort(),
    [...expected].sort(),
    `${packageName} build output must exactly match its source graph`,
  );
  if (packageName === "contract") {
    const expectedSpecs = (await listFiles(path.join(packageRoot, "spec")))
      .filter((file) => file.endsWith(".json"))
      .sort();
    const actualSpecs = (await listFiles(path.join(packageRoot, "dist", "spec")))
      .filter((file) => file.endsWith(".json"))
      .sort();
    assert.deepEqual(actualSpecs, expectedSpecs, "contract schema output must match source specs");
  }
}

async function listFiles(root, relativeDirectory = "") {
  const directory = path.join(root, ...relativeDirectory.split("/").filter(Boolean));
  const entries = (await readdir(directory, { withFileTypes: true }))
    .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  const files = [];
  for (const entry of entries) {
    const relativePath = relativeDirectory.length === 0
      ? entry.name
      : `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

async function runMensor(cwd, fixture) {
  return capture(
    pnpmExecutable ? pnpmEntrypoint : process.execPath,
    [
      ...(pnpmExecutable ? [] : [pnpmEntrypoint]),
      "exec",
      "mensor",
      "check",
      fixture,
      "--json",
    ],
    cwd,
  );
}

function tarballDependency(tarball) {
  return `file:${path.relative(consumerRoot, tarball).split(path.sep).join("/")}`;
}

async function runPnpm(args, cwd) {
  return run(
    pnpmExecutable ? pnpmEntrypoint : process.execPath,
    [...(pnpmExecutable ? [] : [pnpmEntrypoint]), ...args],
    cwd,
  );
}

async function run(command, args, cwd) {
  const result = await capture(command, args, cwd);
  if (result.code !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with ${result.code}\n${result.stdout}${result.stderr}`,
    );
  }
}

async function capture(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, CI: "1" },
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
