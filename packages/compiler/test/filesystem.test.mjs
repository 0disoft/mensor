import assert from "node:assert/strict";
import test from "node:test";

import { readProjectFile } from "../dist/src/filesystem.js";

test("reads through one bounded handle and verifies the post-read identity", async () => {
  const calls = [];
  const stable = fileStat({ size: 5n });
  const operations = {
    async lstat(file) {
      calls.push(["lstat", file]);
      return file.endsWith("source.ts") ? stable : directoryStat();
    },
    async open(file) {
      calls.push(["open", file]);
      let statCount = 0;
      return {
        async stat() {
          statCount += 1;
          calls.push(["fstat", statCount]);
          return stable;
        },
        async read(buffer, offset, length, position) {
          calls.push(["read", offset, length, position]);
          if (offset > 0) {
            return { bytesRead: 0 };
          }
          buffer.set(Buffer.from("hello"), offset);
          return { bytesRead: 5 };
        },
        async close() {
          calls.push(["close"]);
        },
      };
    },
  };

  assert.equal(
    await readProjectFile("C:/project", "src/deep/source.ts", 5, operations),
    "hello",
  );
  assert.deepEqual(calls.map(([name]) => name), [
    "lstat",
    "lstat",
    "open",
    "fstat",
    "read",
    "read",
    "fstat",
    "lstat",
    "close",
  ]);
});

test("rejects a file that changes while the open handle is read", async () => {
  const before = fileStat({ size: 4n, mtimeNs: 1n });
  const after = fileStat({ size: 4n, mtimeNs: 2n });
  let statCount = 0;
  const operations = {
    async lstat() {
      return after;
    },
    async open() {
      return {
        async stat() {
          statCount += 1;
          return statCount === 1 ? before : after;
        },
        async read(buffer) {
          buffer.set(Buffer.from("data"));
          return { bytesRead: 4 };
        },
        async close() {},
      };
    },
  };

  await assert.rejects(
    readProjectFile("C:/project", "source.ts", 4, operations),
    (error) => error?.code === "file.changed_during_read",
  );
});

test("reads at most one byte beyond the configured file limit", async () => {
  const stable = fileStat({ size: 4n });
  let requestedLength = 0;
  const operations = {
    async lstat() {
      return stable;
    },
    async open() {
      return {
        async stat() {
          return stable;
        },
        async read(buffer, offset, length) {
          requestedLength += length;
          buffer.fill(0x61, offset, offset + length);
          return { bytesRead: length };
        },
        async close() {},
      };
    },
  };

  await assert.rejects(
    readProjectFile("C:/project", "source.ts", 4, operations),
    (error) => error?.code === "file.size_limit_exceeded",
  );
  assert.equal(requestedLength, 5);
});

function fileStat(overrides = {}) {
  return {
    ctimeNs: 1n,
    dev: 1n,
    ino: 2n,
    mtimeNs: 1n,
    size: 0n,
    isDirectory: () => false,
    isFile: () => true,
    isSymbolicLink: () => false,
    ...overrides,
  };
}

function directoryStat() {
  return {
    ...fileStat(),
    isDirectory: () => true,
    isFile: () => false,
  };
}
