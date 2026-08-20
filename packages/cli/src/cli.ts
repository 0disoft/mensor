import { readFileSync } from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";

import { checkProject, type CompilerFailure } from "@0disoft/mensor-compiler";

import { runInitCommand } from "./init-command.js";
import type {
  CliFailureEnvelope,
  RunCliOptions,
} from "./types.js";

type CliReportVersion = 1 | 2;
type ParsedArguments = ReturnType<typeof parseArgs>;

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

const helpText = `Usage:
  mensor check [root] [--config <path>] [--json] [--report-version <1|2>]
  mensor init [root] --feature-root <path> --feature-id <id> --handler-role <role> [options]

Commands:
  check    Check project contracts against static source facts.
  init     Create conservative project and feature contract drafts.

Check options:
  --config <path>         Root-relative project contract path.
  --json                  Write one canonical JSON document to stdout.
  --report-version <1|2>  Select JSON output revision 1 or 2. Requires --json.

Init options:
  --source-root <path>    Source directory. Defaults to src.
  --config <path>         Project contract output. Defaults to mensor.project.jsonc.
  --feature-root <path>   Project-relative feature directory to inspect.
  --feature-id <id>       Explicit feature identity for the draft.
  --handler-role <role>   Explicit architectural role for the selected handler.
  --action-id <id>        Override the generated action identity.
  --document-path <path>  GET page route, required for current-document forms.
  --form-file <path>      Select one project-relative static HTML file.
  --form-id <id>          Select one form id. Requires --form-file.
  --handler-file <path>   Select one project-relative TypeScript or JavaScript file.
  --handler-export <name> Select one named runtime export. Requires --handler-file.

General options:
  --help, -h              Show this help.
`;

export async function runCli(options: RunCliOptions): Promise<number> {
  let parsed: ParsedArguments;
  try {
    parsed = parseArgs({
      args: [...options.argv],
      allowPositionals: true,
      strict: true,
      options: {
        "action-id": { type: "string" },
        config: { type: "string" },
        "document-path": { type: "string" },
        "feature-id": { type: "string" },
        "feature-root": { type: "string" },
        "form-file": { type: "string" },
        "form-id": { type: "string" },
        "handler-export": { type: "string" },
        "handler-file": { type: "string" },
        "handler-role": { type: "string" },
        help: { type: "boolean", short: "h" },
        json: { type: "boolean" },
        "report-version": { type: "string" },
        "source-root": { type: "string" },
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

  if (parsed.values["help"] === true) {
    options.stdout(helpText);
    return 0;
  }

  const command = parsed.positionals[0];
  if (command === "check") {
    return runCheckCommand(options, parsed);
  }
  if (command === "init") {
    return runInitCommand(options, parsed);
  }
  return writeUsageFailure(
    options,
    "Expected command check or init.",
    parsed.values["json"] === true,
    requestedReportVersion(options.argv),
  );
}

async function runCheckCommand(
  options: RunCliOptions,
  parsed: ParsedArguments,
): Promise<number> {
  const json = parsed.values["json"] === true;
  if (parsed.positionals.length > 2) {
    return writeUsageFailure(
      options,
      "Expected command check and at most one project root.",
      json,
      requestedReportVersion(options.argv),
    );
  }
  const initOption = firstPresentOption(parsed, [
    "action-id",
    "document-path",
    "feature-id",
    "feature-root",
    "form-file",
    "form-id",
    "handler-export",
    "handler-file",
    "handler-role",
    "source-root",
  ]);
  if (initOption !== undefined) {
    return writeUsageFailure(
      options,
      `--${initOption} is valid only with mensor init.`,
      json,
      requestedReportVersion(options.argv),
    );
  }

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

  const root = path.resolve(options.cwd, parsed.positionals[1] ?? ".");
  const configResult = relativeProjectOption(
    parsed.values["config"],
    "config",
  );
  if (!configResult.ok) {
    writeFailure(options, configResult.failure, json, reportVersion);
    return 2;
  }
  const checkOptions = {
    root,
    producerVersion: cliVersion,
    ...(configResult.value === undefined
      ? {}
      : { configFile: configResult.value }),
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

interface RelativeOptionSuccess {
  readonly ok: true;
  readonly value: string | undefined;
}

interface RelativeOptionFailure {
  readonly ok: false;
  readonly failure: CompilerFailure;
}

type RelativeOptionResult = RelativeOptionSuccess | RelativeOptionFailure;

function relativeProjectOption(
  value: unknown,
  name: string,
): RelativeOptionResult {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (typeof value !== "string") {
    return {
      ok: false,
      failure: {
        kind: "configuration",
        code: "cli.usage_invalid",
        message: `--${name} requires one value.`,
      },
    };
  }
  if (path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    return {
      ok: false,
      failure: {
        kind: "configuration",
        code: `cli.${name.replaceAll("-", "_")}_not_relative`,
        message: `--${name} must be relative to the selected project root.`,
        file: value,
      },
    };
  }
  return { ok: true, value: value.replaceAll("\\", "/") };
}

function firstPresentOption(
  parsed: ParsedArguments,
  names: readonly string[],
): string | undefined {
  return names.find((name) => parsed.values[name] !== undefined);
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
