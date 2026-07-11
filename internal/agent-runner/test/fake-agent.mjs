import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const mode = process.argv[2];
const input = JSON.parse(await readStdin());
const inputKeys = Object.keys(input).sort();
if (
  input.schemaVersion !== 1 ||
  inputKeys.join(",") !== "baselineId,diagnosticReport,mutationId,schemaVersion"
) {
  process.exitCode = 2;
} else if (mode === "repair") {
  const diagnostic = input.diagnosticReport?.diagnostics?.[0];
  if (
    input.diagnosticReport?.status !== "failed" ||
    input.diagnosticReport?.diagnostics?.length !== 1 ||
    diagnostic?.code !== "form.field_missing" ||
    diagnostic?.repair?.strategy !== "add-missing-form-control" ||
    typeof diagnostic?.facts?.template !== "string" ||
    typeof diagnostic?.facts?.fieldName !== "string" ||
    !/^[A-Za-z][A-Za-z0-9_-]*$/.test(diagnostic.facts.fieldName)
  ) {
    process.exitCode = 6;
    process.exit();
  }
  const parts = diagnostic.facts.template.split("/");
  if (parts.includes("..") || parts.some((part) => part.length === 0)) {
    process.exitCode = 7;
    process.exit();
  }
  const file = path.join(...parts);
  const html = await readFile(file, "utf8");
  await writeFile(
    file,
    html.replace(
      "      </label>",
      `        <input name="${diagnostic.facts.fieldName}" type="text" required="required" />\n      </label>`,
    ),
    "utf8",
  );
  process.stdout.write('{"schemaVersion":1,"rounds":1}\n');
} else if (mode === "environment") {
  if (process.env.ALLOWED === "yes" && process.env.FORBIDDEN === undefined) {
    process.stdout.write('{"schemaVersion":1,"rounds":1}\n');
  } else {
    process.exitCode = 3;
  }
} else if (mode === "sentinel") {
  await writeFile("agent-started.marker", "started\n", "utf8");
  process.stdout.write('{"schemaVersion":1,"rounds":1}\n');
} else if (mode === "invalid-json") {
  process.stdout.write("not-json");
} else if (mode === "output-limit") {
  process.stdout.write("x".repeat(16_384));
} else if (mode === "failure") {
  process.stderr.write("provider command failure details");
  process.exitCode = 4;
} else if (mode === "hang") {
  setInterval(() => {}, 1_000);
} else {
  process.exitCode = 5;
}

async function readStdin() {
  let value = "";
  for await (const chunk of process.stdin) {
    value += chunk;
  }
  return value;
}
