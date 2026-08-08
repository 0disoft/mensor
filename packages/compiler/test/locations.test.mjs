import assert from "node:assert/strict";
import test from "node:test";

import {
  contractLocatorFor,
  handlerExportRange,
  handlerFileRange,
} from "../dist/src/locations.js";

test("counts CR, LF, and CRLF as equivalent contract line breaks", () => {
  const ranges = ["\r", "\n", "\r\n"].map((newline) => {
    const text = [
      "{",
      '  "actions": [',
      "    {",
      '      "handler": {',
      '        "file": "server/handler.ts",',
      '        "export": "createTask"',
      "      }",
      "    }",
      "  ]",
      "}",
    ].join(newline);
    return {
      exportRange: handlerExportRange(text, 0),
      fileRange: handlerFileRange(text, 0),
    };
  });

  assert.deepEqual(ranges[0], ranges[1]);
  assert.deepEqual(ranges[1], ranges[2]);
  assert.equal(ranges[0].fileRange.start.line, 4);
  assert.equal(ranges[0].exportRange.start.line, 5);
});

test("reuses one parsed locator for repeated contract range queries", () => {
  const text = '{"actions":[{"handler":{"file":"handler.ts","export":"run"}}]}';
  const first = contractLocatorFor(text);

  handlerFileRange(text, 0);
  handlerExportRange(text, 0);

  assert.equal(contractLocatorFor(text), first);
});
