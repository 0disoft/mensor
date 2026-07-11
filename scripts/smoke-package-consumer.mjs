import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    await run(
      pnpmExecutable ? pnpmEntrypoint : process.execPath,
      [
        ...(pnpmExecutable ? [] : [pnpmEntrypoint]),
        "--filter",
        `@mensor/${packageName}`,
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
        const tarballName = `mensor-${packageName}-${packageJson.version}.tgz`;
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
          "@mensor/contract": tarballDependency(tarballs.contract),
          "@mensor/compiler": tarballDependency(tarballs.compiler),
          "@mensor/cli": tarballDependency(tarballs.cli),
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
      `  "@mensor/contract": "${tarballDependency(tarballs.contract)}"`,
      `  "@mensor/compiler": "${tarballDependency(tarballs.compiler)}"`,
      `  "@mensor/cli": "${tarballDependency(tarballs.cli)}"`,
      "",
    ].join("\n"),
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

  await runPnpm(["install", "--offline", "--ignore-scripts"], consumerRoot);

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
