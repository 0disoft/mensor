import assert from "node:assert/strict";
import test from "node:test";

import {
  contentDigest,
  verifyRouteIndex,
} from "../dist/src/route-index.js";

test("reads, hashes, and splits each RouteIndex source only once", async () => {
  const source = "first route\nsecond route\n";
  const digest = contentDigest(source);
  let sourceReads = 0;
  const routeIndex = {
    schemaVersion: 1,
    producer: { name: "test", version: "1.0.0" },
    routes: Array.from({ length: 1_000 }, (_, index) => ({
      method: index % 2 === 0 ? "GET" : "POST",
      path: `/route-${index}`,
      source: {
        file: "src/routes.ts",
        contentDigest: digest,
        range: {
          start: { line: index % 2, character: 0 },
          end: { line: index % 2, character: 5 },
        },
      },
    })),
  };

  const verified = await verifyRouteIndex({
    routeIndex,
    discovered: new Set(["src/routes.ts"]),
    sourceFacts: {
      async source(file) {
        sourceReads += 1;
        assert.equal(file, "src/routes.ts");
        return source;
      },
      async get() {
        throw new Error("Module parsing is not required for RouteIndex verification.");
      },
    },
  });

  assert.equal(sourceReads, 1);
  assert.equal(verified.routeKeys.size, 1_000);
  assert.equal(verified.postPaths.length, 500);
  assert.equal(verified.value, routeIndex);
});
