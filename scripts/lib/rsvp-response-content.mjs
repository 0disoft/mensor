import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(new URL("../../packages/compiler/package.json", import.meta.url));
const { parseFragment } = await import(pathToFileURL(require.resolve("parse5")).href);

export function responseText(template, html) {
  const parts = template.split("{{responses}}");
  assert.equal(parts.length, 2, "Oracle template must contain exactly one response marker");
  const [prefix, suffix] = parts;
  assert.ok(html.startsWith(prefix) && html.endsWith(suffix), "Application must preserve the supplied template");
  assert.ok(html.length >= prefix.length + suffix.length);
  const fragment = html.slice(prefix.length, html.length - suffix.length);
  return collect(parseFragment(fragment)).replace(/\s+/gu, " ").trim();
}

function collect(node) {
  if (["script", "style", "template", "noscript"].includes(node.tagName)
    || node.attrs?.some((attribute) => attribute.name === "hidden")) return "";
  if (node.nodeName === "#text") return node.value;
  if (node.tagName === "br") return " ";
  const text = (node.childNodes ?? []).map(collect).join("");
  return ["p", "li", "div", "section", "td", "th"].includes(node.tagName) ? ` ${text} ` : text;
}
