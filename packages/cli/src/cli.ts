import { readFileSync } from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";

import {
  checkProject,
  compileProject,
  type CompilerFailure,
} from "@0disoft/mensor-compiler";

import {
  HonoRouteIndexError,
  produceHonoRouteIndex,
} from "./hono-route-index.js";
import {
  produceTypeScriptTemplateFormIndex,
  TypeScriptTemplateFormIndexError,
} from "./typescript-template-form-index.js";
import {
  writeCanonicalArtifactAtomic,
  writeManifestAtomic,
} from "./manifest-output.js";
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

const helpText = `Usage: mensor <check|compile|index-hono-routes|index-ts-forms> [root] [options]

Commands:
  check              Check project contracts against static source facts.
  compile            Check contracts and atomically write a runtime manifest.
  index-hono-routes  Produce a source-bound RouteIndex from explicit Hono sources.
  index-ts-forms     Produce a FormIndex from explicit tagged HTML templates.

Options:
  --config <path>    Root-relative project contract path.
  --json             Write one canonical JSON document to stdout.
  --out <path>       Root-relative output path.
  --source <path>    Hono source path; repeat for multiple files.
  --receiver <name>  Hono receiver identifier; repeat for multiple receivers.
  --tag <name>       Tagged-template identifier; repeat for multiple tags.
  --report-version   Select check JSON output revision 1 or 2. Requires --json.
  --help             Show this help.
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
        out: { type: "string" },
        receiver: { type: "string", multiple: true },
        "report-version": { type: "string" },
        source: { type: "string", multiple: true },
        tag: { type: "string", multiple: true },
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
  const command = parsed.positionals[0];
  if (
    (
      command !== "check" &&
      command !== "compile" &&
      command !== "index-hono-routes" &&
      command !== "index-ts-forms"
    ) ||
    parsed.positionals.length > 2
  ) {
    return writeUsageFailure(
      options,
      "Expected command check, compile, index-hono-routes, or index-ts-forms and at most one project root.",
      json,
      reportVersion,
    );
  }

  if (command !== "check" && reportVersionValue !== undefined) {
    return writeUsageFailure(
      options,
      "--report-version is available only for check.",
      json,
      reportVersion,
    );
  }
  if (command === "check" && parsed.values["out"] !== undefined) {
    return writeUsageFailure(
      options,
      "--out is available only for compile and index commands.",
      json,
      reportVersion,
    );
  }
  if (
    (command === "index-hono-routes" || command === "index-ts-forms")
    && parsed.values["config"] !== undefined
  ) {
    return writeUsageFailure(
      options,
      "--config is unavailable for index commands.",
      json,
      reportVersion,
    );
  }
  if (
    command !== "index-hono-routes" && command !== "index-ts-forms" &&
    (
      parsed.values["source"] !== undefined
      || parsed.values["receiver"] !== undefined
      || parsed.values["tag"] !== undefined
    )
  ) {
    return writeUsageFailure(
      options,
      "--source, --receiver, and --tag are available only for index commands.",
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
  if (command !== "index-hono-routes" && parsed.values["receiver"] !== undefined) {
    return writeUsageFailure(
      options,
      "--receiver is available only for index-hono-routes.",
      json,
      reportVersion,
    );
  }
  if (command !== "index-ts-forms" && parsed.values["tag"] !== undefined) {
    return writeUsageFailure(
      options,
      "--tag is available only for index-ts-forms.",
      json,
      reportVersion,
    );
  }
  const config =
    typeof configValue === "string"
      ? configValue.replaceAll("\\", "/")
      : undefined;
  if (command === "index-hono-routes") {
    const sources = stringArray(parsed.values["source"]);
    const receivers = stringArray(parsed.values["receiver"]);
    if (sources === undefined || receivers === undefined) {
      return writeUsageFailure(
        options,
        "--source and --receiver must each contain string values.",
        json,
        reportVersion,
      );
    }
    const outputValue = parsed.values["out"];
    const output = typeof outputValue === "string"
      ? normalizeRelativeOutput(outputValue)
      : "mensor.route-index.json";
    if (output === undefined) {
      return writeUsageFailure(
        options,
        "--out must be relative to the selected project root.",
        json,
        reportVersion,
      );
    }
    try {
      const produced = await produceHonoRouteIndex({
        root,
        sources,
        receivers,
        producerVersion: cliVersion,
      });
      await writeCanonicalArtifactAtomic(root, output, produced.text);
      options.stdout(json ? produced.text : `Wrote Hono RouteIndex to ${output}.\n`);
      return 0;
    } catch (error) {
      if (error instanceof HonoRouteIndexError) {
        writeFailure(
          options,
          {
            kind: "configuration",
            code: error.code,
            message: error.message,
            ...(error.file === undefined ? {} : { file: error.file }),
          },
          json,
          reportVersion,
        );
        return 2;
      }
      writeFailure(
        options,
        {
          kind: "filesystem",
          code: "route_indexer.output_write_failed",
          message: "The Hono RouteIndex could not be written atomically.",
          file: output,
        },
        json,
        reportVersion,
      );
      return 3;
    }
  }
  if (command === "index-ts-forms") {
    const sources = stringArray(parsed.values["source"]);
    const tags = stringArray(parsed.values["tag"]);
    if (sources === undefined || tags === undefined) {
      return writeUsageFailure(
        options,
        "--source and --tag must each contain string values.",
        json,
        reportVersion,
      );
    }
    const outputValue = parsed.values["out"];
    const output = typeof outputValue === "string"
      ? normalizeRelativeOutput(outputValue)
      : "mensor.form-index.json";
    if (output === undefined) {
      return writeUsageFailure(
        options,
        "--out must be relative to the selected project root.",
        json,
        reportVersion,
      );
    }
    try {
      const produced = await produceTypeScriptTemplateFormIndex({
        root,
        sources,
        tags,
        producerVersion: cliVersion,
      });
      await writeCanonicalArtifactAtomic(root, output, produced.text);
      options.stdout(json ? produced.text : `Wrote TypeScript FormIndex to ${output}.\n`);
      return 0;
    } catch (error) {
      if (error instanceof TypeScriptTemplateFormIndexError) {
        writeFailure(
          options,
          {
            kind: "configuration",
            code: error.code,
            message: error.message,
            ...(error.file === undefined ? {} : { file: error.file }),
          },
          json,
          reportVersion,
        );
        return 2;
      }
      writeFailure(
        options,
        {
          kind: "filesystem",
          code: "form_indexer.output_write_failed",
          message: "The TypeScript FormIndex could not be written atomically.",
          file: output,
        },
        json,
        reportVersion,
      );
      return 3;
    }
  }
  const checkOptions = {
    root,
    producerVersion: cliVersion,
    ...(config === undefined ? {} : { configFile: config }),
  };
  if (command === "compile") {
    const outputValue = parsed.values["out"];
    const output = typeof outputValue === "string"
      ? normalizeRelativeOutput(outputValue)
      : ".mensor/manifest.json";
    if (output === undefined) {
      return writeUsageFailure(
        options,
        "--out must be relative to the selected project root.",
        json,
        reportVersion,
      );
    }
    const compiled = await compileProject(checkOptions);
    if (!compiled.ok) {
      if (compiled.kind === "diagnostics") {
        writeReport(options, compiled.report, json);
        return 1;
      }
      const exitCode = compiled.failure.kind === "configuration" ? 2 : 3;
      writeFailure(options, compiled.failure, json, reportVersion);
      return exitCode;
    }
    const manifestText = `${JSON.stringify(compiled.manifest, null, 2)}\n`;
    try {
      await writeManifestAtomic(root, output, manifestText);
    } catch {
      writeFailure(
        options,
        {
          kind: "filesystem",
          code: "cli.manifest_write_failed",
          message: "The runtime manifest could not be written atomically.",
          file: output,
        },
        json,
        reportVersion,
      );
      return 3;
    }
    options.stdout(json ? manifestText : `Wrote runtime manifest to ${output}.\n`);
    return 0;
  }
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

function writeReport(
  options: RunCliOptions,
  report: {
    readonly diagnostics: readonly {
      readonly file: string;
      readonly range: {
        readonly start: { readonly line: number; readonly character: number };
      };
      readonly code: string;
      readonly message: string;
    }[];
  },
  json: boolean,
): void {
  if (json) {
    options.stdout(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  for (const diagnostic of report.diagnostics) {
    options.stdout(
      `${diagnostic.file}:${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1} ${diagnostic.code} ${diagnostic.message}\n`,
    );
  }
}

function normalizeRelativeOutput(value: string): string | undefined {
  if (
    value.length === 0 ||
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value)
  ) {
    return undefined;
  }
  const normalized = value.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    return undefined;
  }
  return normalized;
}

function stringArray(value: unknown): readonly string[] | undefined {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return undefined;
  }
  return value;
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
