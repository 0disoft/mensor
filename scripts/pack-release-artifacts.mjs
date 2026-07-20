import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(import.meta.url);

export const releasePackageNames = ["contract", "compiler", "cli"];

export function releaseArtifactFileName(packageName, version) {
  if (!releasePackageNames.includes(packageName)) {
    throw new Error(`Unknown release package ${JSON.stringify(packageName)}.`);
  }
  return `0disoft-mensor-${packageName}-${version}.tgz`;
}

export async function packReleaseArtifacts({
  repositoryRoot,
  outputRoot,
  expectedVersion,
  pnpmEntrypoint,
  environment = process.env,
}) {
  const releaseRoot = path.resolve(outputRoot);
  const releaseRelative = path.relative(repositoryRoot, releaseRoot);
  if (
    releaseRelative.length === 0 ||
    releaseRelative.startsWith("..") ||
    path.isAbsolute(releaseRelative)
  ) {
    throw new Error("Release output must be a child of the repository.");
  }
  if (pnpmEntrypoint === undefined || pnpmEntrypoint.length === 0) {
    throw new Error("Release packing must be run through the configured pnpm script.");
  }

  const workspace = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  if (expectedVersion !== workspace.version) {
    throw new Error(
      `Requested release version ${expectedVersion} does not match workspace version ${workspace.version}.`,
    );
  }

  const pnpmExecutable = path.extname(pnpmEntrypoint).toLowerCase() === ".exe";
  await rm(releaseRoot, { recursive: true, force: true });
  await mkdir(releaseRoot, { recursive: true });

  const artifacts = [];
  for (const packageName of releasePackageNames) {
    const packageId = `@0disoft/mensor-${packageName}`;
    await run(
      pnpmExecutable ? pnpmEntrypoint : process.execPath,
      [
        ...(pnpmExecutable ? [] : [pnpmEntrypoint]),
        "--filter",
        packageId,
        "pack",
        "--pack-destination",
        releaseRoot,
      ],
      repositoryRoot,
      environment,
    );
    const file = releaseArtifactFileName(packageName, expectedVersion);
    const absoluteFile = path.join(releaseRoot, file);
    const bytes = await readFile(absoluteFile);
    const metadata = await stat(absoluteFile);
    artifacts.push({
      name: packageId,
      version: expectedVersion,
      file,
      size: metadata.size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }

  const manifest = {
    schemaVersion: 1,
    version: expectedVersion,
    artifacts,
  };
  await writeFile(
    path.join(releaseRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === modulePath) {
  const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
  const workspace = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  const expectedVersion = parseVersion(process.argv.slice(2)) ?? workspace.version;
  await packReleaseArtifacts({
    repositoryRoot,
    outputRoot: path.join(repositoryRoot, "dist", "release"),
    expectedVersion,
    pnpmEntrypoint: process.env.npm_execpath,
  });
}

function parseVersion(args) {
  if (args.length === 0) {
    return undefined;
  }
  if (args.length !== 2 || args[0] !== "--version" || args[1].startsWith("--")) {
    throw new Error("Usage: pnpm run release:pack -- --version <workspace-version>");
  }
  return args[1];
}

async function run(command, args, cwd, environment) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...environment, CI: "1" },
      shell: false,
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? 1}.`));
      }
    });
  });
}
