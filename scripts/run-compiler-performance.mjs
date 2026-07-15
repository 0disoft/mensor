import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const sourceFileCounts = parseSourceFileCounts(process.argv.slice(2));
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const worker = path.join(scriptDirectory, "compiler-performance-worker.mjs");
const temporaryRoot = await mkdtemp(path.join(tmpdir(), "mensor-performance-"));

try {
  const cases = [];
  for (const sourceFileCount of sourceFileCounts) {
    const root = path.join(temporaryRoot, String(sourceFileCount));
    const sourceBytes = await createProject(root, sourceFileCount);
    const firstRun = await runWorker(root);
    const repeatRun = await runWorker(root);
    cases.push({ sourceFileCount, sourceBytes, firstRun, repeatRun });
  }
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    kind: "local-compiler-performance",
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
    method: {
      processIsolation: true,
      cacheState: "first-run-after-generation-and-immediate-repeat",
      osCacheFlushed: false,
      casesRunSerially: true,
    },
    cases,
  }, null, 2)}\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function createProject(root, sourceFileCount) {
  if (!Number.isSafeInteger(sourceFileCount) || sourceFileCount < 3) {
    throw new Error("sourceFileCount must be an integer of at least 3.");
  }
  const featureRoot = path.join(root, "src", "features", "tasks");
  const sharedRoot = path.join(featureRoot, "shared");
  await mkdir(path.join(featureRoot, "server"), { recursive: true });
  await mkdir(path.join(featureRoot, "views"), { recursive: true });
  await mkdir(sharedRoot, { recursive: true });

  const projectContract = `${JSON.stringify({
    version: 1,
    sourceRoot: "src",
    featureContracts: ["src/features/tasks/feature.mensor.jsonc"],
    fileRoles: [
      { role: "server", withinFeature: "server" },
      { role: "shared", withinFeature: "shared" },
      { role: "view", withinFeature: "views" },
    ],
    boundaries: [{
      id: "shared-no-server",
      mode: "direct",
      from: ["shared"],
      deny: ["server"],
    }],
  }, null, 2)}\n`;
  const featureContract = `${JSON.stringify({
    version: 1,
    feature: { id: "tasks" },
    actions: [{
      id: "tasks.create",
      route: { method: "POST", path: "/tasks" },
      form: { template: "views/index.html", id: "create-task" },
      handler: {
        file: "server/create-task.ts",
        export: "createTask",
        role: "server",
      },
      input: {
        schema: {
          kind: "object",
          properties: { title: { kind: "string", minLength: 1, maxLength: 120 } },
          required: ["title"],
        },
        formCodec: {
          encoding: "urlencoded",
          unknownFields: "reject",
          bindings: [{
            name: "title",
            path: ["title"],
            decode: { kind: "text", trim: true, empty: "reject" },
          }],
        },
      },
    }],
  }, null, 2)}\n`;
  const handler = "export function createTask(input) { return input.title; }\n";
  const template = [
    "<!doctype html>",
    '<form id="create-task" method="post" action="/tasks">',
    '  <input name="title" type="text">',
    "</form>",
    "",
  ].join("\n");

  await Promise.all([
    writeFile(path.join(root, "mensor.project.jsonc"), projectContract, "utf8"),
    writeFile(path.join(featureRoot, "feature.mensor.jsonc"), featureContract, "utf8"),
    writeFile(path.join(featureRoot, "server", "create-task.ts"), handler, "utf8"),
    writeFile(path.join(featureRoot, "views", "index.html"), template, "utf8"),
  ]);

  const fillerCount = sourceFileCount - 3;
  const fillerSources = [];
  for (let index = 0; index < fillerCount; index += 1) {
    const source = `export const value${index} = ${index};\n`;
    fillerSources.push(source);
    if (fillerSources.length === 128 || index === fillerCount - 1) {
      const firstIndex = index - fillerSources.length + 1;
      await Promise.all(fillerSources.map((contents, offset) =>
        writeFile(
          path.join(sharedRoot, `module-${String(firstIndex + offset).padStart(5, "0")}.ts`),
          contents,
          "utf8",
        ),
      ));
      fillerSources.length = 0;
    }
  }

  return Buffer.byteLength(featureContract)
    + Buffer.byteLength(handler)
    + Buffer.byteLength(template)
    + Array.from({ length: fillerCount }, (_, index) =>
      Buffer.byteLength(`export const value${index} = ${index};\n`),
    ).reduce((total, bytes) => total + bytes, 0);
}

function runWorker(root) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker, root], {
      cwd: scriptDirectory,
      env: {},
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 16_384) {
        child.kill();
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 16_384) {
        child.kill();
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Performance worker failed with exit ${String(code)}: ${stderr.trim()}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error("Performance worker emitted invalid JSON.", { cause: error }));
      }
    });
  });
}

function parseSourceFileCounts(args) {
  if (args.length === 0) {
    return [1_000, 5_000, 10_000];
  }
  if (args.length !== 2 || args[0] !== "--sizes") {
    throw new Error("Usage: run-compiler-performance.mjs [--sizes comma-separated-counts]");
  }
  const counts = args[1].split(",").map((value) => Number(value));
  if (
    counts.length === 0
    || counts.some((value) => !Number.isSafeInteger(value) || value < 3 || value > 10_000)
    || new Set(counts).size !== counts.length
  ) {
    throw new Error("Performance sizes must be unique integers from 3 through 10000.");
  }
  return counts;
}
