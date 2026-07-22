import { readFileSync } from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";

import { checkProject, type CompilerFailure } from "@0disoft/mensor-compiler";

import type {
  CliFailureEnvelope,
  RunCliOptions,
} from "./types.js";

type CliReportVersion = 1 | 2;

interface CliFailureEnvelopeV2 {
  readonly schemaVersion: 2;
  readonly producer: {
    readonly name: "mensor";
    readonly version: string;
  };
  readonly status: "error";
  readonly failure: CompilerFailure;
}

export const cliVersion = readPackageVersion();

function readPackageVersion(): string {
  let value: unknown;
  try {
    value = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    );
  } catch {
    throw new Error("CLI package metadata must contain valid JSON.");
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("version" in value) ||
    typeof value.version !== "string" ||
    !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/u.test(value.version)
  ) {
    throw new Error("CLI package metadata must declare a semantic version.");
  }
  return value.version;
}

const helpText = `Usage: mensor check [root] [--config <path>] [--json] [--report-version <1|2>]

Commands:
  check    Check project contracts against static source facts.

Options:
  --config <path>  Root-relative project contract path.
  --json           Write one canonical JSON document to stdout.
  --report-version Select JSON output revision 1 or 2. Requires --json.
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
        "report-version": { type: "string" },
      },
    });
  } catch (error) {
    return writeUsageFailure(
      options,
      errorMessage(error),
      options.argv.includes("--json"),
      requestedReportVersion(options.argv),
    );
  }

  const json = parsed.values["json"] === true;
  const rawReportVersion = parsed.values["report-version"];
  const reportVersionValue = typeof rawReportVersion === "string"
    ? rawReportVersion
    : undefined;
  if (rawReportVersion !== undefined && reportVersionValue === undefined) {
    return writeUsageFailure(
      options,
      "--report-version requires one value.",
      json,
      1,
    );
  }
  const reportVersion = parseReportVersion(reportVersionValue);
  if (reportVersion === undefined) {
    return writeUsageFailure(
      options,
      "--report-version must be 1 or 2.",
      json,
      1,
    );
  }
  if (reportVersionValue !== undefined && !json) {
    return writeUsageFailure(
      options,
      "--report-version requires --json.",
      false,
      reportVersion,
    );
  }
  if (parsed.values["help"] === true) {
    options.stdout(helpText);
    return 0;
  }
  if (parsed.positionals[0] !== "check" || parsed.positionals.length > 2) {
    return writeUsageFailure(
      options,
      "Expected command check and at most one project root.",
      json,
      reportVersion,
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
      reportVersion,
    );
    return 2;
  }
  const config =
    typeof configValue === "string"
      ? configValue.replaceAll("\\", "/")
      : undefined;
  const checkOptions = {
    root,
    producerVersion: cliVersion,
    ...(config === undefined ? {} : { configFile: config }),
  };
  const result = reportVersion === 2
    ? await checkProject({ ...checkOptions, reportVersion: 2 })
    : await checkProject(checkOptions);

  if (!result.ok) {
    const exitCode = result.failure.kind === "configuration" ? 2 : 3;
    writeFailure(options, result.failure, json, reportVersion);
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
  reportVersion: CliReportVersion,
): number {
  writeFailure(
    options,
    {
      kind: "configuration",
      code: "cli.usage_invalid",
      message,
    },
    json,
    reportVersion,
  );
  return 2;
}

function writeFailure(
  options: RunCliOptions,
  failure: CompilerFailure,
  json: boolean,
  reportVersion: CliReportVersion,
): void {
  if (json) {
    const envelope: CliFailureEnvelope | CliFailureEnvelopeV2 =
      reportVersion === 2
        ? {
            schemaVersion: 2,
            producer: { name: "mensor", version: cliVersion },
            status: "error",
            failure: canonicalV2Failure(failure),
          }
        : {
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

function canonicalV2Failure(failure: CompilerFailure): CompilerFailure {
  if (
    failure.file === undefined ||
    (
      !path.isAbsolute(failure.file) &&
      !path.win32.isAbsolute(failure.file) &&
      /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\).+$/u.test(failure.file)
    )
  ) {
    return failure;
  }
  return {
    kind: failure.kind,
    code: failure.code,
    message: failure.message,
    ...(failure.issues === undefined ? {} : { issues: failure.issues }),
  };
}

function parseReportVersion(value: string | undefined): CliReportVersion | undefined {
  if (value === undefined || value === "1") {
    return 1;
  }
  return value === "2" ? 2 : undefined;
}

function requestedReportVersion(argv: readonly string[]): CliReportVersion {
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--report-version" && argv[index + 1] === "2") {
      return 2;
    }
    if (value === "--report-version=2") {
      return 2;
    }
  }
  return 1;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid command arguments.";
}
