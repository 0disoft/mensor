import assert from "node:assert/strict";
import test from "node:test";

import { parseReleaseVersion } from "../pack-release-artifacts.mjs";

test("release pack version accepts direct script arguments", () => {
  assert.equal(parseReleaseVersion(["--version", "0.1.0"]), "0.1.0");
});

test("release pack version accepts the pnpm argument separator", () => {
  assert.equal(parseReleaseVersion(["--", "--version", "0.1.0"]), "0.1.0");
});

test("release pack version defaults only when no arguments are supplied", () => {
  assert.equal(parseReleaseVersion([]), undefined);
  assert.throws(
    () => parseReleaseVersion(["--"]),
    /Usage: pnpm run release:pack/u,
  );
});

test("release pack version rejects malformed argument lists", () => {
  for (const args of [
    ["--tag", "latest"],
    ["--version"],
    ["--version", "--next"],
    ["--", "--", "--version", "0.1.0"],
    ["--version", "0.1.0", "extra"],
  ]) {
    assert.throws(
      () => parseReleaseVersion(args),
      /Usage: pnpm run release:pack/u,
    );
  }
});
