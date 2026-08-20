import {
  assertProjectRoot,
  discoverProjectSnapshot,
  type ProjectSnapshot,
} from "./filesystem.js";
import {
  assertDraftIdentifier,
  assertDraftRoute,
  createContractDrafts,
} from "./draft-contract.js";
import {
  discoverAndSelectForm,
  resolveFormRoute,
} from "./draft-form.js";
import { discoverAndSelectHandler } from "./draft-handler.js";
import {
  assertRelativePosixPath,
  InputFailure,
  joinProjectPath,
} from "./paths.js";
import type {
  DraftProjectContractsOptions,
  DraftProjectContractsResult,
  DraftProjectContractsSuccess,
} from "./types.js";

const defaultConfigFile = "mensor.project.jsonc";
const defaultSourceRoot = "src";
const defaultMaxFiles = 10_000;
const defaultMaxFileBytes = 1_048_576;
const defaultMaxTotalBytes = 67_108_864;
const defaultMaxDepth = 64;

export async function draftProjectContracts(
  options: DraftProjectContractsOptions,
): Promise<DraftProjectContractsResult> {
  try {
    const root = await assertProjectRoot(options.root);
    const sourceRoot = assertRelativePosixPath(
      options.sourceRoot ?? defaultSourceRoot,
      "sourceRoot",
    );
    const featureRoot = assertRelativePosixPath(
      options.featureRoot,
      "featureRoot",
    );
    if (!isInside(sourceRoot, featureRoot)) {
      throw new InputFailure(
        "configuration",
        "init.feature_root_outside_source",
        `featureRoot ${JSON.stringify(featureRoot)} must be inside sourceRoot ${JSON.stringify(sourceRoot)}.`,
        featureRoot,
      );
    }
    const featureId = assertDraftIdentifier(
      options.featureId,
      "featureId",
      "init.feature_id_invalid",
    );
    const handlerRole = assertDraftIdentifier(
      options.handlerRole,
      "handlerRole",
      "init.handler_role_invalid",
    );
    const configFile = assertRelativePosixPath(
      options.configFile ?? defaultConfigFile,
      "configFile",
    );
    const featureConfigFile = joinProjectPath(
      featureRoot,
      "feature.mensor.jsonc",
    );
    if (configFile === featureConfigFile) {
      throw new InputFailure(
        "configuration",
        "init.output_path_conflict",
        "The project and feature contract paths must be different.",
        configFile,
      );
    }

    const snapshot = await discoverProjectSnapshot(
      root,
      sourceRoot,
      defaultMaxFiles,
      defaultMaxTotalBytes,
      defaultMaxDepth,
    );
    const featureFiles = snapshot.files.filter((file) => isInside(featureRoot, file));
    if (featureFiles.length === 0) {
      throw new InputFailure(
        "configuration",
        "init.feature_empty",
        `featureRoot ${JSON.stringify(featureRoot)} contains no discovered source files.`,
        featureRoot,
      );
    }
    const readSource = cachedSnapshotReader(snapshot);
    const selectedForm = await discoverAndSelectForm(
      featureFiles,
      readSource,
      options.form,
    );
    const selectedHandler = await discoverAndSelectHandler(
      featureFiles,
      readSource,
      options.handler,
    );

    const relativeHandlerFile = relativeInside(
      featureRoot,
      selectedHandler.file,
      "handler file",
    );
    const handlerRoot = relativeHandlerFile.split("/")[0];
    if (handlerRoot === undefined || !relativeHandlerFile.includes("/")) {
      throw new InputFailure(
        "configuration",
        "init.handler_role_root_missing",
        "The selected handler must live in a directory below featureRoot so Mensor can declare a file role.",
        selectedHandler.file,
      );
    }
    const relativeFormFile = relativeInside(
      featureRoot,
      selectedForm.file,
      "form file",
    );
    const documentPath = options.documentPath === undefined
      ? undefined
      : assertDraftRoute(
          options.documentPath,
          "documentPath",
          "init.document_path_invalid",
        );
    const drafts = createContractDrafts({
      ...(options.actionId === undefined ? {} : { actionId: options.actionId }),
      configFile,
      ...(documentPath === undefined ? {} : { documentPath }),
      featureConfigFile,
      featureId,
      fields: selectedForm.fields,
      formId: selectedForm.id,
      formTemplate: relativeFormFile,
      handlerExport: selectedHandler.export,
      handlerFile: relativeHandlerFile,
      handlerRole,
      handlerRoot,
      routePath: resolveFormRoute(selectedForm, documentPath),
      sourceRoot,
    });
    const result: DraftProjectContractsSuccess = {
      ok: true,
      project: drafts.project,
      feature: drafts.feature,
      selection: {
        actionId: drafts.actionId,
        form: { file: selectedForm.file, id: selectedForm.id },
        handler: selectedHandler,
      },
    };
    return result;
  } catch (error) {
    if (error instanceof InputFailure) {
      return {
        ok: false,
        failure: {
          kind: error.kind,
          code: error.code,
          message: error.message,
          ...(error.file === undefined ? {} : { file: error.file }),
        },
      };
    }
    return {
      ok: false,
      failure: {
        kind: "internal",
        code: "compiler.init_failure",
        message: "The compiler could not create contract drafts.",
      },
    };
  }
}

function cachedSnapshotReader(
  snapshot: ProjectSnapshot,
): (file: string) => Promise<string> {
  const cache = new Map<string, Promise<string>>();
  return (file) => {
    let value = cache.get(file);
    if (value === undefined) {
      value = snapshot.readFile(file, defaultMaxFileBytes);
      cache.set(file, value);
    }
    return value;
  };
}

function relativeInside(parent: string, child: string, label: string): string {
  if (!isInside(parent, child) || parent === child) {
    throw new InputFailure(
      "configuration",
      "init.selection_outside_feature",
      `${label} ${JSON.stringify(child)} must be inside featureRoot ${JSON.stringify(parent)}.`,
      child,
    );
  }
  return child.slice(parent.length + 1);
}

function isInside(parent: string, child: string): boolean {
  return child === parent || child.startsWith(`${parent}/`);
}
