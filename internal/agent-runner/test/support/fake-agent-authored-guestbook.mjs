import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeAgentAuthoredGuestbook(
  projectRoot,
  options = {},
) {
  const files = {
    "package.json": `{
  "name": "agent-authored-guestbook",
  "private": true,
  "type": "module"
}
`,
    "mensor.project.jsonc": `{
  "version": 1,
  "sourceRoot": "src",
  "featureContracts": ["src/features/guestbook/feature.mensor.jsonc"],
  "fileRoles": [
    { "role": "server", "withinFeature": "server" },
    { "role": "route", "withinFeature": "routes" },
    { "role": "view", "withinFeature": "views" }
  ]
}
`,
    "src/features/guestbook/feature.mensor.jsonc": featureContract(
      options.missingHandlerExport === true,
    ),
    "src/features/guestbook/server/create-entry.mjs": `export function createGuestbookEntry(input, entries) {
  const entry = { author: input.author, message: input.message };
  entries.push(entry);
  return entry;
}
`,
    "src/app.mjs": `export { createGuestbookApp } from "./features/guestbook/routes/app.mjs";
`,
    "src/features/guestbook/routes/app.mjs": applicationSource(
      options.semanticFailure === true,
    ),
    "src/features/guestbook/views/index.html": `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Guestbook</title></head>
  <body>
    <main>
      <h1>Guestbook</h1>
      <form id="create-entry" method="post" action="/guestbook">
        <label>Author <input name="author" type="text" required></label>
        <label>Message <textarea name="message" required></textarea></label>
        <button type="submit">Sign</button>
      </form>
      <ul><!-- entries --></ul>
    </main>
  </body>
</html>
`,
    "test/semantic.test.mjs": semanticTest,
  };

  for (const [relativePath, source] of Object.entries(files)) {
    const file = path.join(projectRoot, ...relativePath.split("/"));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, source, { encoding: "utf8", flag: "wx" });
  }
}

function applicationSource(semanticFailure) {
  return `import { createGuestbookEntry } from "../server/create-entry.mjs";

export function createGuestbookApp({ templateHtml }) {
  if (typeof templateHtml !== "string") {
    throw new TypeError("templateHtml must be a string");
  }
  const entries = [];
  return {
    entries,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/guestbook") {
        return new Response(render(templateHtml, entries), {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      if (request.method === "POST" && url.pathname === "/guestbook") {
        const contentType = request.headers.get("content-type") ?? "";
        const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
        if (mediaType !== "application/x-www-form-urlencoded") {
          return new Response("Bad Request", { status: 400 });
        }
        const form = new URLSearchParams(await request.text());
        const names = [...new Set(form.keys())].sort();
        if (
          names.join(",") !== "author,message"
          || form.getAll("author").length !== 1
          || form.getAll("message").length !== 1
        ) {
          return new Response("Bad Request", { status: 400 });
        }
        const author = form.get("author")?.trim() ?? "";
        const message = form.get("message")?.trim() ?? "";
        if (author.length === 0 || message.length === 0) {
          return new Response("Bad Request", { status: 400 });
        }
        createGuestbookEntry({ author, message }, entries);
        return new Response(null, {
          status: 303,
          headers: { location: "${semanticFailure ? "/wrong" : "/guestbook"}" },
        });
      }
      return new Response("Not Found", { status: 404 });
    },
  };
}

function render(templateHtml, entries) {
  const rendered = entries
    .map((entry) => "<li><strong>" + escapeHtml(entry.author) + "</strong>: " + escapeHtml(entry.message) + "</li>")
    .join("");
  return templateHtml.replace("<!-- entries -->", rendered);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
`;
}

function featureContract(missingHandlerExport) {
  return `{
  "version": 1,
  "feature": { "id": "guestbook" },
  "actions": [
    {
      "id": "guestbook.create",
      "route": { "method": "POST", "path": "/guestbook" },
      "form": {
        "template": "views/index.html",
        "id": "create-entry",
        "documentPath": "/guestbook"
      },
      "handler": {
        "file": "server/create-entry.mjs",
        "export": "${missingHandlerExport ? "missingCreateEntry" : "createGuestbookEntry"}",
        "role": "server"
      },
      "input": {
        "schema": {
          "kind": "object",
          "properties": {
            "author": { "kind": "string", "minLength": 1, "maxLength": 80 },
            "message": { "kind": "string", "minLength": 1, "maxLength": 500 }
          },
          "required": ["author", "message"]
        },
        "formCodec": {
          "encoding": "urlencoded",
          "unknownFields": "reject",
          "bindings": [
            {
              "name": "author",
              "path": ["author"],
              "decode": { "kind": "text", "trim": true, "empty": "reject" }
            },
            {
              "name": "message",
              "path": ["message"],
              "decode": { "kind": "text", "trim": true, "empty": "reject" }
            }
          ]
        }
      }
    }
  ]
}
`;
}

const semanticTest = `import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createGuestbookApp } from "../src/app.mjs";

const templateHtml = await readFile(new URL(
  "../src/features/guestbook/views/index.html",
  import.meta.url,
), "utf8");

test("serves the form and creates escaped entries", async () => {
  const app = createGuestbookApp({ templateHtml });
  const initial = await app.fetch(new Request("http://local/guestbook"));
  assert.equal(initial.status, 200);
  assert.match(await initial.text(), /id="create-entry"/);

  const created = await app.fetch(new Request("http://local/guestbook", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "author=%3Cb%3EAda%3C%2Fb%3E&message=Hello+%26+welcome",
  }));
  assert.equal(created.status, 303);
  assert.equal(created.headers.get("location"), "/guestbook");
  assert.equal(app.entries.length, 1);

  const rendered = await app.fetch(new Request("http://local/guestbook"));
  const html = await rendered.text();
  assert.ok(html.includes("&lt;b&gt;Ada&lt;/b&gt;"));
  assert.ok(html.includes("Hello &amp; welcome"));
});

test("rejects malformed forms without changing state", async () => {
  const app = createGuestbookApp({ templateHtml });
  for (const body of [
    "author=Ada&author=Grace&message=Hello",
    "author=Ada&message=Hello&extra=value",
    "author=+&message=Hello",
    "author=Ada",
  ]) {
    const response = await app.fetch(new Request("http://local/guestbook", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }));
    assert.equal(response.status, 400);
  }
  assert.equal(app.entries.length, 0);
});
`;
