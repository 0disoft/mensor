import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const mode = process.argv[2];
const input = JSON.parse(await readStdin());
if (input.schemaVersion !== 1) {
  process.exitCode = 2;
} else if (mode === "repair") {
  const file = path.join("src", "features", "tasks", "views", "index.html");
  const html = await readFile(file, "utf8");
  await writeFile(
    file,
    html.replace(
      "      </label>",
      '        <input name="title" type="text" required="required" />\n      </label>',
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
} else if (mode === "invalid-json") {
  process.stdout.write("not-json");
} else if (mode === "output-limit") {
  process.stdout.write("x".repeat(16_384));
} else if (mode === "failure") {
  process.stderr.write("private provider failure details");
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
