import * as path from "node:path";
import { parseArgs } from "node:util";

import { checkProject, type CompilerFailure } from "@mensor/compiler";

import type {
  CliFailureEnvelope,
  RunCliOptions,
} from "./types.js";

export const cliVersion = "0.0.20";

const helpText = `Usage: mensor check [root] [--config <path>] [--json]

Commands:
  check    Check project contracts against static source facts.

Options:
  --config <path>  Root-relative project contract path.
  --json           Write one canonical JSON document to stdout.
  --help           Show this help.
`;

export async function runCli(options: RunCliOptions): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...options.argv],
      allowPositionals: true,
      strict: true,
      options: {
        config: { type: "string" },
        help: { type: "boolean", short: "h" },
        json: { type: "boolean" },
      },
    });
  } catch (error) {
    return writeUsageFailure(
      options,
      errorMessage(error),
      options.argv.includes("--json"),
    );
  }

  const json = parsed.values["json"] === true;
  if (parsed.values["help"] === true) {
    options.stdout(helpText);
    return 0;
  }
  if (parsed.positionals[0] !== "check" || parsed.positionals.length > 2) {
    return writeUsageFailure(
      options,
      "Expected command check and at most one project root.",
      json,
    );
  }

  const root = path.resolve(options.cwd, parsed.positionals[1] ?? ".");
  const configValue = parsed.values["config"];
  if (
    typeof configValue === "string" &&
    (path.isAbsolute(configValue) || path.win32.isAbsolute(configValue))
  ) {
    writeFailure(
      options,
      {
        kind: "configuration",
        code: "cli.config_not_relative",
        message: "--config must be relative to the selected project root.",
        file: configValue,
      },
      json,
    );
    return 2;
  }
  const config =
    typeof configValue === "string"
      ? configValue.replaceAll("\\", "/")
      : undefined;
  const result = await checkProject({
    root,
    producerVersion: cliVersion,
    ...(config === undefined ? {} : { configFile: config }),
  });

  if (!result.ok) {
    const exitCode = result.failure.kind === "configuration" ? 2 : 3;
    writeFailure(options, result.failure, json);
    return exitCode;
  }

  if (json) {
    options.stdout(`${JSON.stringify(result.report, null, 2)}\n`);
  } else if (result.report.diagnostics.length === 0) {
    options.stdout("No contract violations found.\n");
  } else {
    for (const diagnostic of result.report.diagnostics) {
      const line = diagnostic.range.start.line + 1;
      const character = diagnostic.range.start.character + 1;
      options.stdout(
        `${diagnostic.file}:${line}:${character} ${diagnostic.code} ${diagnostic.message}\n`,
      );
    }
  }
  return result.report.summary.errorCount === 0 ? 0 : 1;
}

function writeUsageFailure(
  options: RunCliOptions,
  message: string,
  json: boolean,
): number {
  writeFailure(
    options,
    {
      kind: "configuration",
      code: "cli.usage_invalid",
      message,
    },
    json,
  );
  return 2;
}

function writeFailure(
  options: RunCliOptions,
  failure: CompilerFailure,
  json: boolean,
): void {
  if (json) {
    const envelope: CliFailureEnvelope = {
      schemaVersion: 1,
      producer: { name: "mensor", version: cliVersion },
      status: "error",
      failure,
    };
    options.stdout(`${JSON.stringify(envelope, null, 2)}\n`);
    return;
  }
  options.stderr(`mensor: ${failure.code}: ${failure.message}\n`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid command arguments.";
}
