import * as path from "node:path";

import {
  draftProjectContracts,
  type CompilerFailure,
} from "@0disoft/mensor-compiler";

import { writeDraftFiles } from "./draft-files.js";
import type { RunCliOptions } from "./types.js";

interface ParsedArguments {
  readonly positionals: readonly string[];
  readonly values: Readonly<Record<string, string | boolean | (string | boolean)[] | undefined>>;
}

export async function runInitCommand(
  options: RunCliOptions,
  parsed: ParsedArguments,
): Promise<number> {
  if (parsed.positionals.length > 2) {
    return usageFailure(
      options,
      "Expected command init and at most one project root.",
    );
  }
  if (parsed.values["json"] === true) {
    return usageFailure(options, "--json is not supported by mensor init.");
  }
  if (parsed.values["report-version"] !== undefined) {
    return usageFailure(
      options,
      "--report-version is valid only with mensor check --json.",
    );
  }

  const featureRoot = requiredStringOption(parsed, "feature-root");
  if (!featureRoot.ok) {
    return usageFailure(options, featureRoot.message);
  }
  const featureId = requiredStringOption(parsed, "feature-id");
  if (!featureId.ok) {
    return usageFailure(options, featureId.message);
  }
  const handlerRole = requiredStringOption(parsed, "handler-role");
  if (!handlerRole.ok) {
    return usageFailure(options, handlerRole.message);
  }
  const formSelection = pairedStringOptions(parsed, "form-file", "form-id");
  if (!formSelection.ok) {
    return usageFailure(options, formSelection.message);
  }
  const handlerSelection = pairedStringOptions(
    parsed,
    "handler-file",
    "handler-export",
  );
  if (!handlerSelection.ok) {
    return usageFailure(options, handlerSelection.message);
  }

  const root = path.resolve(options.cwd, parsed.positionals[1] ?? ".");
  const config = relativeProjectOption(parsed.values["config"], "config");
  if (!config.ok) {
    return compilerFailure(options, config.failure);
  }
  const relativeFeatureRoot = relativeProjectOption(
    featureRoot.value,
    "feature-root",
  );
  if (!relativeFeatureRoot.ok) {
    return compilerFailure(options, relativeFeatureRoot.failure);
  }
  const formFile = relativeProjectOption(formSelection.left, "form-file");
  if (!formFile.ok) {
    return compilerFailure(options, formFile.failure);
  }
  const handlerFile = relativeProjectOption(
    handlerSelection.left,
    "handler-file",
  );
  if (!handlerFile.ok) {
    return compilerFailure(options, handlerFile.failure);
  }
  const sourceRoot = relativeProjectOption(
    parsed.values["source-root"],
    "source-root",
  );
  if (!sourceRoot.ok) {
    return compilerFailure(options, sourceRoot.failure);
  }
  const actionId = stringOption(parsed, "action-id");
  const documentPath = stringOption(parsed, "document-path");

  const result = await draftProjectContracts({
    root,
    featureRoot: requiredRelativeValue(relativeFeatureRoot),
    featureId: featureId.value,
    handlerRole: handlerRole.value,
    ...(config.value === undefined ? {} : { configFile: config.value }),
    ...(sourceRoot.value === undefined ? {} : { sourceRoot: sourceRoot.value }),
    ...(actionId === undefined ? {} : { actionId }),
    ...(documentPath === undefined ? {} : { documentPath }),
    ...(formSelection.left === undefined || formSelection.right === undefined
      ? {}
      : {
          form: {
            file: requiredRelativeValue(formFile),
            id: formSelection.right,
          },
        }),
    ...(handlerSelection.left === undefined || handlerSelection.right === undefined
      ? {}
      : {
          handler: {
            file: requiredRelativeValue(handlerFile),
            export: handlerSelection.right,
          },
        }),
  });
  if (!result.ok) {
    return compilerFailure(options, result.failure);
  }

  const writeFailure = await writeDraftFiles(
    root,
    [result.feature, result.project],
  );
  if (writeFailure !== undefined) {
    return compilerFailure(options, writeFailure);
  }

  options.stdout(
    `Created ${result.project.path}\n` +
    `Created ${result.feature.path}\n` +
    `Selected form ${result.selection.form.file}#${result.selection.form.id}\n` +
    `Selected handler ${result.selection.handler.file}#${result.selection.handler.export}\n` +
    "Review requiredness, decoders, and fileRoles before running mensor check.\n",
  );
  return 0;
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

function requiredRelativeValue(result: RelativeOptionResult): string {
  if (!result.ok || result.value === undefined) {
    throw new Error("Required relative CLI option was not validated.");
  }
  return result.value;
}

function requiredStringOption(
  parsed: ParsedArguments,
  name: string,
):
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string } {
  const value = stringOption(parsed, name);
  return value === undefined
    ? { ok: false, message: `--${name} is required by mensor init.` }
    : { ok: true, value };
}

function pairedStringOptions(
  parsed: ParsedArguments,
  leftName: string,
  rightName: string,
):
  | {
      readonly ok: true;
      readonly left: string | undefined;
      readonly right: string | undefined;
    }
  | { readonly ok: false; readonly message: string } {
  const left = stringOption(parsed, leftName);
  const right = stringOption(parsed, rightName);
  if ((left === undefined) !== (right === undefined)) {
    return {
      ok: false,
      message: `--${leftName} and --${rightName} must be supplied together.`,
    };
  }
  return { ok: true, left, right };
}

function stringOption(parsed: ParsedArguments, name: string): string | undefined {
  const value = parsed.values[name];
  return typeof value === "string" ? value : undefined;
}

function usageFailure(options: RunCliOptions, message: string): number {
  return compilerFailure(options, {
    kind: "configuration",
    code: "cli.usage_invalid",
    message,
  });
}

function compilerFailure(
  options: RunCliOptions,
  failure: CompilerFailure,
): number {
  options.stderr(`mensor: ${failure.code}: ${failure.message}\n`);
  return failure.kind === "configuration" ? 2 : 3;
}
