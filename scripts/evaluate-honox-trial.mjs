import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "@typescript/typescript6";

const root = fileURLToPath(new URL("../", import.meta.url));
const trial = path.join(root, "internal/agent-runner/trials/honox-rsvp-v1");
const oracle = path.join(root, "internal/agent-runner/oracles/honox-rsvp-v1.test.mjs");
const evidenceFile = path.join(trial, "evidence.json");
let attempts = [];
try {
  attempts = JSON.parse(await readFile(evidenceFile, "utf8")).attempts ?? [];
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const digest = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
const inputs = ["package.json", "package-lock.json", "tsconfig.json", "vite.config.ts", "app/server.ts",
  "app/routes/_renderer.tsx", "app/routes/rsvp.tsx", "src/app.mjs", "original-response.json"];
const hashes = {};
for (const name of inputs) hashes[name] = await digest(path.join(trial, name));
hashes.oracle = await digest(oracle);
hashes.brief = await digest(path.join(root, "internal/agent-runner/briefs/honox-rsvp-v1.md"));
hashes.evaluator = await digest(fileURLToPath(import.meta.url));
const routeText = await readFile(path.join(trial, "app/routes/rsvp.tsx"), "utf8");
const source = ts.createSourceFile("app/routes/rsvp.tsx", routeText,
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
if (source.parseDiagnostics.length > 0) throw new Error("Invalid trial TSX syntax");
const jsxInventory = [];
function inspect(node, inForm = false) {
  const opening = ts.isJsxElement(node) ? node.openingElement
    : ts.isJsxSelfClosingElement(node) ? node : undefined;
  if (opening) {
    const tag = opening.tagName.getText(source);
    inForm ||= tag === "form";
    if (inForm) jsxInventory.push({
      tag, start: opening.getStart(source), end: opening.end,
      attributes: opening.attributes.properties.map((attribute) => {
        if (ts.isJsxSpreadAttribute(attribute)) return { kind: "spread" };
        const value = attribute.initializer;
        return { name: attribute.name.getText(source),
          kind: value === undefined ? "boolean" : ts.isStringLiteral(value) ? "literal" : "expression",
          ...(value && ts.isStringLiteral(value) ? { value: value.text } : {}),
        };
      }),
    });
  }
  if (ts.isJsxExpression(node) && node.expression) jsxInventory.push({
    expression: true, inForm, start: node.getStart(source), end: node.end,
  });
  ts.forEachChild(node, (child) => inspect(child, inForm));
}
inspect(source);
const run = (args) => {
  const result = spawnSync(process.execPath, args, {
    cwd: trial, env: process.env, encoding: "utf8", timeout: 45_000,
    maxBuffer: 262_144, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error || result.signal) throw result.error ?? new Error(`Terminated: ${result.signal}`);
  return result.status;
};
const buildStatus = run(["node_modules/vite/bin/vite.js", "build"]);
const semanticStatus = buildStatus === 0 ? run(["--test", oracle]) : null;
const artifacts = {};
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(file);
    else artifacts[path.relative(trial, file).replaceAll("\\", "/")] = await digest(file);
  }
}
if (buildStatus === 0) await collect(path.join(trial, "dist"));
const lock = JSON.parse(await readFile(path.join(trial, "package-lock.json"), "utf8"));
const versions = {};
for (const name of ["hono", "honox", "vite"]) versions[name] = lock.packages[`node_modules/${name}`].version;
attempts.push({ hashes, artifacts, buildStatus, semanticStatus });
await writeFile(evidenceFile, JSON.stringify({
  schemaVersion: "mensor.honox-exploration/v1", node: process.version,
  platform: process.platform, arch: process.arch, versions, hashes, artifacts, jsxInventory,
  buildStatus, semanticStatus, attempts,
  isolation: "Host process, minimal inherited Mustflow environment; no OS sandbox or network enforcement",
  provenance: "Fresh non-forked author agent; tool use forbidden by prompt, not OS-enforced; evaluator-owned toolchain",
  coverage: "HTTP oracle and reviewed source only; no JSX FormIndex or generalized framework support",
}, null, 2) + "\n");
process.exitCode = buildStatus === 0 && semanticStatus === 0 ? 0 : 1;
