import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const expectedPackages = {
  "@0disoft/mensor-cli": "0.9.0",
  "@0disoft/mensor-compiler": "0.9.0",
  "@0disoft/mensor-contract": "0.9.0",
  "@0disoft/mensor-reference-runtime": "0.9.0",
};

test("declares the exact published Mensor 0.9.0 package set", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(process.cwd(), "package.json"), "utf8"),
  );
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.type, "module");
  assert.equal(packageJson.packageManager, "pnpm@11.11.0");
  assert.deepEqual(packageJson.devDependencies, expectedPackages);
  assert.equal(Object.hasOwn(packageJson, "dependencies"), false);
  assert.equal(Object.hasOwn(packageJson, "workspaces"), false);
  assert.equal(Object.hasOwn(packageJson, "pnpm"), false);
  for (const name of Object.keys(packageJson.scripts ?? {})) {
    assert.doesNotMatch(name, /^(?:pre|post)?(?:install|pack|publish|prepare)$/u);
  }
});

await import("./rsvp-v2.test.mjs");
