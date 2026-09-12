import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isPackageManagerExecutable } from "./lib/package-manager-entrypoint.mjs";
import { copyHonoJsxTrial, prepareHonoJsxConsumerFixture } from "./lib/hono-jsx-consumer-fixture.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const temporaryRoot = await mkdtemp(path.join(tmpdir(), "mensor-package-smoke-"));
const tarballRoot = path.join(temporaryRoot, "tarballs");
const consumerRoot = path.join(temporaryRoot, "consumer");
const pnpmEntrypoint = process.env.npm_execpath;
if (pnpmEntrypoint === undefined || pnpmEntrypoint.length === 0) {
  throw new Error("Package smoke must be run through the configured pnpm script.");
}
const pnpmExecutable = isPackageManagerExecutable(pnpmEntrypoint);

try {
  await mkdir(consumerRoot, { recursive: true });
  const packageNames = ["contract", "compiler", "cli", "reference-runtime"];
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
          "@0disoft/mensor-reference-runtime": tarballDependency(tarballs["reference-runtime"]),
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
      `  "@0disoft/mensor-reference-runtime": "${tarballDependency(tarballs["reference-runtime"])}"`,
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(consumerRoot, "contract-smoke.mjs"),
    `import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseCheckOutputV2, parseFormIndex, parseRouteIndex, parseRuntimeManifest, serializeFormIndex, serializeRouteIndex, serializeRuntimeManifest } from "@0disoft/mensor-contract";
import { formatDiagnosticReportSarif } from "@0disoft/mensor-cli";
import { compileProject } from "@0disoft/mensor-compiler";
import { extractHonoJsxFormDocument } from "@0disoft/mensor-compiler/hono-jsx";
import { createReferenceRuntime } from "@0disoft/mensor-reference-runtime";

const jsx = extractHonoJsxFormDocument("view.tsx", 'const view = <><h1>Smoke</h1><form id="smoke" /></>;');
assert.equal(jsx.inspection.state, "complete");
assert.equal(jsx.forms[0].identity.value, "smoke");

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
const formIndexText = serializeFormIndex({
  schemaVersion: 1,
  producer: { name: "package-smoke", version: "1.0.0" },
  documents: []
});
assert.equal(parseFormIndex(formIndexText).ok, true);
const manifestText = serializeRuntimeManifest({
  manifestVersion: 1,
  producer: { name: "package-smoke", version: "1.0.0" },
  pages: [],
  actions: []
});
assert.equal(parseRuntimeManifest(manifestText).ok, true);
assert.equal(parseCheckOutputV2(JSON.stringify({
  schemaVersion: 2,
  producer: { name: "mensor", version: "0.0.0-smoke" },
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
const sarif = JSON.parse(formatDiagnosticReportSarif({
  schemaVersion: 1,
  producer: { name: "mensor", version: "0.0.0-smoke" },
  status: "passed",
  diagnostics: [],
  summary: { errorCount: 0, warningCount: 0 }
}));
assert.equal(sarif.version, "2.1.0");
assert.deepEqual(sarif.runs[0].results, []);
const schemaUrl = import.meta.resolve(
  "@0disoft/mensor-contract/schemas/route-index-v1.schema.json"
);
const schema = JSON.parse(await readFile(new URL(schemaUrl), "utf8"));
assert.equal(schema.$id, "route-index-v1.schema.json");
const formIndexSchemaUrl = import.meta.resolve(
  "@0disoft/mensor-contract/schemas/form-index-v1.schema.json"
);
const formIndexSchema = JSON.parse(
  await readFile(new URL(formIndexSchemaUrl), "utf8")
);
assert.equal(formIndexSchema.$id, "form-index-v1.schema.json");
const checkOutputSchemaUrl = import.meta.resolve(
  "@0disoft/mensor-contract/schemas/check-output-v2.schema.json"
);
const checkOutputSchema = JSON.parse(
  await readFile(new URL(checkOutputSchemaUrl), "utf8")
);
assert.equal(checkOutputSchema.$id, "check-output-v2.schema.json");
const runtimeManifestSchemaUrl = import.meta.resolve(
  "@0disoft/mensor-contract/schemas/runtime-manifest-v1.schema.json"
);
const runtimeManifestSchema = JSON.parse(
  await readFile(new URL(runtimeManifestSchemaUrl), "utf8")
);
assert.equal(runtimeManifestSchema.$id, "runtime-manifest-v1.schema.json");
const compiled = await compileProject({ root: path.resolve("valid") });
assert.equal(compiled.ok, true);
if (compiled.ok) assert.equal(compiled.manifest.actions.length, 1);
if (compiled.ok) {
  const runtime = createReferenceRuntime({
    manifest: compiled.manifest,
    actionGuard: () => ({ allowed: true }),
    handlers: {
      "tasks.create": ({ input }) => ({ kind: "html", body: String(input.title) })
    }
  });
  const page = await runtime.handle(new Request("https://example.test/tasks"));
  assert.equal(page.status, 200);
  const action = await runtime.handle(new Request("https://example.test/tasks", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "title=Package+smoke"
  }));
  assert.equal(action.status, 200);
  assert.equal(await action.text(), "Package smoke");
}
`,
    "utf8",
  );

  await cp(path.join(repositoryRoot, "fixtures", "valid", "tiny-tasks"), path.join(consumerRoot, "valid"), {
    recursive: true,
  });
  await cp(path.join(repositoryRoot, "fixtures", "valid", "tiny-tasks"), path.join(consumerRoot, "valid-ts"), {
    recursive: true,
  });
  await prepareTypeScriptFormFixture(path.join(consumerRoot, "valid-ts"));
  await prepareHonoJsxConsumerFixture(repositoryRoot, path.join(consumerRoot, "valid-jsx"));
  await copyHonoJsxTrial(repositoryRoot, path.join(consumerRoot, "real-rsvp"));
  const guardedRoot = path.join(consumerRoot, "guarded-rsvp");
  await mkdir(guardedRoot);
  for (const file of ["app", "mensor.project.jsonc", "tsconfig.json", "vite.config.ts"]) {
    await cp(path.join(repositoryRoot, "examples/honox-guarded-rsvp", file), path.join(guardedRoot, file), { recursive: true });
  }
  await cp(
    path.join(repositoryRoot, "fixtures", "valid", "hono-static-tasks"),
    path.join(consumerRoot, "valid-hono"),
    { recursive: true },
  );
  await cp(
    path.join(repositoryRoot, "fixtures", "invalid", "form-field-missing"),
    path.join(consumerRoot, "invalid"),
    { recursive: true },
  );

  await runPnpm(["install", "--prefer-offline", "--ignore-scripts"], consumerRoot);
  const rootLicense = await readFile(path.join(repositoryRoot, "LICENSE"), "utf8");
  const readmeMarkers = {
    contract: [
      "# @0disoft/mensor-contract",
      "parseProjectContract",
      "schemas/check-output-v2.schema.json",
      "parseRuntimeManifest",
    ],
    compiler: [
      "# @0disoft/mensor-compiler",
      "checkProject",
      "compileProject",
      "does not\nexecute project source or configuration",
    ],
    cli: [
      "# @0disoft/mensor-cli",
      "pnpm exec mensor check . --json",
      "pnpm exec mensor check . --sarif",
      "pnpm exec mensor compile . --out .mensor/manifest.json",
      "pnpm exec mensor index-hono-routes . --source src/routes.ts --receiver app",
      "pnpm exec mensor index-ts-forms . --source src/views.ts --tag html",
      "--report-version 2",
    ],
    "reference-runtime": [
      "# @0disoft/mensor-reference-runtime",
      "createReferenceRuntime",
      "actionGuard",
    ],
  };
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
    const packageReadme = await readFile(
      path.join(installedPackageRoot, "README.md"),
      "utf8",
    );
    for (const marker of readmeMarkers[packageName]) {
      assert.ok(
        packageReadme.includes(marker),
        `${packageName} package README must contain ${JSON.stringify(marker)}`,
      );
    }
  }
  await run(process.execPath, ["contract-smoke.mjs"], consumerRoot);
  await assertInstalledEnumHints(consumerRoot);
  await assertInstalledMissingConfigHints(consumerRoot);

  const valid = await runMensor(consumerRoot, "valid");
  assert.equal(valid.code, 0, valid.stderr);
  assert.equal(JSON.parse(valid.stdout).status, "passed");

  const validV2 = await runMensor(consumerRoot, "valid", [
    "--report-version",
    "2",
  ]);
  assert.equal(validV2.code, 0, validV2.stderr);
  const validV2Report = JSON.parse(validV2.stdout);
  assert.equal(validV2Report.schemaVersion, 2);
  assert.equal(validV2Report.status, "passed");
  assert.equal(validV2Report.inspection.routes.state, "not-configured");

  const compiledByCli = await runMensorCompile(consumerRoot, "valid");
  assert.equal(compiledByCli.code, 0, compiledByCli.stderr);
  const compiledManifestText = await readFile(
    path.join(consumerRoot, "valid", ".mensor", "manifest.json"),
    "utf8",
  );
  assert.equal(compiledManifestText, compiledByCli.stdout);
  assert.equal(JSON.parse(compiledManifestText).manifestVersion, 1);

  const honoIndex = await runMensorHonoIndex(consumerRoot);
  assert.equal(honoIndex.code, 0, honoIndex.stderr);
  const honoIndexValue = JSON.parse(honoIndex.stdout);
  assert.equal(honoIndexValue.producer.name, "mensor-hono-route-indexer");
  assert.deepEqual(
    honoIndexValue.routes.map(({ method, path: routePath }) => [method, routePath]),
    [["GET", "/tasks"], ["POST", "/tasks"]],
  );

  const formIndex = await runMensorTypeScriptFormIndex(consumerRoot);
  assert.equal(formIndex.code, 0, formIndex.stderr);
  assert.equal(JSON.parse(formIndex.stdout).producer.name, "mensor-typescript-template-form-indexer");
  const typedProject = await runMensor(consumerRoot, "valid-ts", [
    "--report-version",
    "2",
  ]);
  assert.equal(typedProject.code, 0, typedProject.stderr);
  assert.equal(JSON.parse(typedProject.stdout).inspection.forms.basis, "form-index");

  const jsxIndex = await runMensorJsxIndex(consumerRoot, "valid-jsx");
  assert.equal(jsxIndex.code, 0, jsxIndex.stdout || jsxIndex.stderr);
  assert.equal(JSON.parse(jsxIndex.stdout).producer.name, "mensor/hono-jsx");
  assert.equal(await readFile(path.join(consumerRoot, "valid-jsx/mensor.form-index.json"), "utf8"), jsxIndex.stdout);
  const jsxChecked = await runMensor(consumerRoot, "valid-jsx", ["--report-version", "2"]);
  assert.equal(jsxChecked.code, 0, jsxChecked.stdout || jsxChecked.stderr);
  assert.equal(JSON.parse(jsxChecked.stdout).inspection.forms.basis, "form-index");
  const jsxConfig = path.join(consumerRoot, "valid-jsx/tsconfig.json");
  await writeFile(jsxConfig, await readFile(jsxConfig, "utf8") + "\n");
  const staleJsx = await runMensor(consumerRoot, "valid-jsx");
  assert.equal(staleJsx.code, 2, staleJsx.stdout);
  assert.equal(JSON.parse(staleJsx.stdout).failure.code, "form_index.digest_mismatch");
  const jsxSource = path.join(consumerRoot, "valid-jsx/app/routes/index.tsx");
  await writeFile(jsxSource, (await readFile(jsxSource, "utf8")).replace('name="title"', 'name="other"'));
  assert.equal((await runMensorJsxIndex(consumerRoot, "valid-jsx")).code, 0);
  const driftedJsx = await runMensor(consumerRoot, "valid-jsx");
  assert.equal(driftedJsx.code, 1, driftedJsx.stdout);
  assert.ok(JSON.parse(driftedJsx.stdout).diagnostics.some((item) => item.code === "form.field_missing"));
  const guardedIndex = await runMensorJsxIndex(consumerRoot, "guarded-rsvp", "app/routes/rsvp.tsx");
  assert.equal(guardedIndex.code, 0, guardedIndex.stdout);
  const guardedCheck = await runMensor(consumerRoot, "guarded-rsvp", ["--report-version", "2"]);
  assert.equal(guardedCheck.code, 0, guardedCheck.stdout);
  assert.deepEqual(JSON.parse(guardedCheck.stdout).inspection.forms, { state: "checked", basis: "form-index" });
  const guardedSource = path.join(guardedRoot, "app/routes/rsvp.tsx");
  await writeFile(guardedSource, (await readFile(guardedSource, "utf8")).replace('name="email"', 'name="contact"'));
  const guardedStale = await runMensor(consumerRoot, "guarded-rsvp");
  assert.equal(guardedStale.code, 2, guardedStale.stdout);
  assert.equal(JSON.parse(guardedStale.stdout).failure.code, "form_index.digest_mismatch");
  assert.equal((await runMensorJsxIndex(consumerRoot, "guarded-rsvp", "app/routes/rsvp.tsx")).code, 0);
  const guardedDrift = await runMensor(consumerRoot, "guarded-rsvp");
  assert.equal(guardedDrift.code, 1, guardedDrift.stdout);
  assert.ok(JSON.parse(guardedDrift.stdout).diagnostics.some((entry) => entry.code === "form.field_missing" && entry.facts.fieldName === "email"));
  const rsvp = await runMensorJsxIndex(consumerRoot, "real-rsvp", "app/routes/rsvp.tsx");
  assert.equal(rsvp.code, 0, rsvp.stdout);
  const rsvpDocument = JSON.parse(rsvp.stdout).documents.find((entry) => entry.path === "app/routes/rsvp.tsx");
  assert.equal(rsvpDocument.inspection.state, "incomplete");
  assert.equal(rsvpDocument.inspection.reason, "repeated-generation");
  assert.deepEqual(rsvpDocument.forms, []);

  const invalid = await runMensor(consumerRoot, "invalid");
  assert.equal(invalid.code, 1, invalid.stderr);
  const invalidReport = JSON.parse(invalid.stdout);
  assert.equal(invalidReport.status, "failed");
  assert.deepEqual(
    invalidReport.diagnostics.map((diagnostic) => diagnostic.code),
    ["form.field_missing"],
  );
  const invalidSarif = await runMensorSarif(consumerRoot, "invalid");
  assert.equal(invalidSarif.code, 1, invalidSarif.stderr);
  const invalidSarifValue = JSON.parse(invalidSarif.stdout);
  assert.equal(invalidSarifValue.version, "2.1.0");
  assert.deepEqual(
    invalidSarifValue.runs[0].results.map((result) => result.ruleId),
    ["form.field_missing"],
  );

  const invalidV2 = await runMensor(consumerRoot, "invalid", [
    "--report-version=2",
  ]);
  assert.equal(invalidV2.code, 1, invalidV2.stderr);
  const invalidV2Report = JSON.parse(invalidV2.stdout);
  assert.equal(invalidV2Report.schemaVersion, 2);
  assert.equal(invalidV2Report.status, "failed");
  assert.equal(invalidV2Report.inspection.forms.state, "checked");
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

async function assertInstalledEnumHints(cwd) {
  const root = path.join(cwd, "invalid-enum");
  await cp(path.join(cwd, "valid"), root, { recursive: true });
  const file = path.join(root, "src/features/tasks/feature.mensor.jsonc");
  const contract = JSON.parse(await readFile(file, "utf8"));
  contract.actions[0].input.formCodec.bindings[0].decode = {
    kind: "enum", values: ["yes", "no"], trim: true, empty: "reject",
  };
  await writeFile(file, `${JSON.stringify(contract)}\n`, "utf8");
  const human = await capture(pnpmExecutable ? pnpmEntrypoint : process.execPath,
    [...(pnpmExecutable ? [] : [pnpmEntrypoint]), "exec", "mensor", "check", "invalid-enum"], cwd);
  assert.equal(human.code, 2, human.stdout || human.stderr);
  assert.equal(human.stdout, "");
  const expectedHint = '  hint: /actions/0/input/formCodec/bindings/0/decode: ' +
    'enum decoders accept only "kind" and "values"; "trim" and "empty" are text-decoder options.\n';
  const metadata = JSON.parse(await readFile(
    path.join(cwd, "node_modules/@0disoft/mensor-cli/package.json"), "utf8"));
  let originalFailure;
  for (const schemaVersion of [1, 2]) {
    const result = await runMensor(cwd, "invalid-enum", ["--report-version", String(schemaVersion)]);
    assert.equal(result.code, 2, result.stdout || result.stderr);
    assert.equal(result.stderr, "");
    const envelope = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(envelope), ["schemaVersion", "producer", "status", "failure"]);
    assert.equal(envelope.schemaVersion, schemaVersion);
    assert.deepEqual(envelope.producer, { name: "mensor", version: metadata.version });
    assert.equal(envelope.status, "error");
    assert.equal(envelope.failure.code, "contract.invalid");
    assert.ok(envelope.failure.issues.length > 0);
    assert.equal(human.stderr, `mensor: contract.invalid: ${envelope.failure.message}\n${expectedHint}`);
    if (originalFailure) assert.deepEqual(envelope.failure, originalFailure);
    originalFailure = envelope.failure;
    assert.equal(result.stdout, `${JSON.stringify(envelope, null, 2)}\n`);
    assert.equal(result.stdout.includes("hint:"), false);
  }
  process.stdout.write(`Installed CLI ${metadata.version}: enum human hint and JSON v1/v2 passed.\n`);
}

async function assertInstalledMissingConfigHints(cwd) {
  const fixture = "missing-config";
  const root = path.join(cwd, fixture);
  await mkdir(root);
  const metadata = JSON.parse(await readFile(
    path.join(cwd, "node_modules/@0disoft/mensor-cli/package.json"), "utf8"));
  for (const config of [undefined, "custom.jsonc", "settings/custom.jsonc"]) {
    const flags = config === undefined ? [] : ["--config", config];
    let originalFailure;
    for (const schemaVersion of [1, 2]) {
      const result = await runMensor(cwd, fixture, [...flags, "--report-version", String(schemaVersion)]);
      assert.equal(result.code, 3, result.stdout || result.stderr);
      assert.equal(result.stderr, "");
      const envelope = JSON.parse(result.stdout);
      assert.deepEqual(Object.keys(envelope), ["schemaVersion", "producer", "status", "failure"]);
      assert.equal(envelope.schemaVersion, schemaVersion);
      assert.deepEqual(envelope.producer, { name: "mensor", version: metadata.version });
      assert.equal(envelope.status, "error");
      assert.equal(envelope.failure.kind, "filesystem");
      assert.equal(envelope.failure.code, "path.missing");
      assert.equal(envelope.failure.file, config === "settings/custom.jsonc" ? "settings" : config ?? "mensor.project.jsonc");
      if (originalFailure) assert.deepEqual(envelope.failure, originalFailure);
      originalFailure = envelope.failure;
      assert.equal(result.stdout, `${JSON.stringify(envelope, null, 2)}\n`);
      assert.equal(result.stdout.includes("hint:"), false);
    }
    for (const command of ["check", "compile"]) {
      const human = await capture(pnpmExecutable ? pnpmEntrypoint : process.execPath,
        [...(pnpmExecutable ? [] : [pnpmEntrypoint]), "exec", "mensor", command, fixture, ...flags], cwd);
      assert.equal(human.code, 3, human.stdout || human.stderr);
      assert.equal(human.stdout, "");
      assert.ok(human.stderr.startsWith(`mensor: path.missing: ${originalFailure.message}\n`));
      assert.ok(human.stderr.includes(`  hint: Project contract ${JSON.stringify(config ?? "mensor.project.jsonc")}`));
      assert.match(human.stderr, /select the correct root or --config path/u);
      assert.match(human.stderr, /Installing Mensor does not create contract files/u);
      assert.deepEqual(await readdir(root), []);
    }
  }
  process.stdout.write(`Installed CLI ${metadata.version}: missing config hints, JSON v1/v2 and no writes passed.\n`);
}

async function runMensor(cwd, fixture, extraArgs = []) {
  return capture(
    pnpmExecutable ? pnpmEntrypoint : process.execPath,
    [
      ...(pnpmExecutable ? [] : [pnpmEntrypoint]),
      "exec",
      "mensor",
      "check",
      fixture,
      "--json",
      ...extraArgs,
    ],
    cwd,
  );
}

async function runMensorSarif(cwd, fixture) {
  return capture(
    pnpmExecutable ? pnpmEntrypoint : process.execPath,
    [
      ...(pnpmExecutable ? [] : [pnpmEntrypoint]),
      "exec",
      "mensor",
      "check",
      fixture,
      "--sarif",
    ],
    cwd,
  );
}

async function runMensorCompile(cwd, fixture) {
  return capture(
    pnpmExecutable ? pnpmEntrypoint : process.execPath,
    [
      ...(pnpmExecutable ? [] : [pnpmEntrypoint]),
      "exec",
      "mensor",
      "compile",
      fixture,
      "--out",
      ".mensor/manifest.json",
      "--json",
    ],
    cwd,
  );
}

async function runMensorHonoIndex(cwd) {
  return capture(
    pnpmExecutable ? pnpmEntrypoint : process.execPath,
    [
      ...(pnpmExecutable ? [] : [pnpmEntrypoint]),
      "exec",
      "mensor",
      "index-hono-routes",
      "valid-hono",
      "--source",
      "src/features/tasks/routes/tasks.mjs",
      "--receiver",
      "app",
      "--json",
    ],
    cwd,
  );
}

async function runMensorTypeScriptFormIndex(cwd) {
  return capture(
    pnpmExecutable ? pnpmEntrypoint : process.execPath,
    [
      ...(pnpmExecutable ? [] : [pnpmEntrypoint]),
      "exec",
      "mensor",
      "index-ts-forms",
      "valid-ts",
      "--source",
      "src/features/tasks/views/index.ts",
      "--tag",
      "html",
      "--json",
    ],
    cwd,
  );
}

async function prepareTypeScriptFormFixture(root) {
  const projectPath = path.join(root, "mensor.project.jsonc");
  const featurePath = path.join(root, "src", "features", "tasks", "feature.mensor.jsonc");
  const htmlPath = path.join(root, "src", "features", "tasks", "views", "index.html");
  const sourcePath = path.join(root, "src", "features", "tasks", "views", "index.ts");
  const html = await readFile(htmlPath, "utf8");
  await rename(htmlPath, sourcePath);
  await writeFile(sourcePath, `export const view = html\`${html}\`;\n`, "utf8");
  const project = JSON.parse(await readFile(projectPath, "utf8"));
  project.formIndex = "mensor.form-index.json";
  await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
  const feature = JSON.parse(await readFile(featurePath, "utf8"));
  feature.actions[0].form.template = "views/index.ts";
  await writeFile(featurePath, `${JSON.stringify(feature, null, 2)}\n`, "utf8");
}

async function runMensorJsxIndex(cwd, fixture, source = "app/routes/index.tsx") {
  return capture(pnpmExecutable ? pnpmEntrypoint : process.execPath, [
    ...(pnpmExecutable ? [] : [pnpmEntrypoint]), "exec", "mensor", "index-hono-jsx-forms", fixture,
    "--source", source, "--renderer", "app/routes/_renderer.tsx", "--jsx-config", "tsconfig.json",
    "--build-config", "vite.config.ts", "--json",
  ], cwd);
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
