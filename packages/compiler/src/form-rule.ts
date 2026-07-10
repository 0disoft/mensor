import * as path from "node:path";

import type {
  Diagnostic,
  FeatureContract,
  FormFieldMissingDiagnostic,
} from "@mensor/contract";

import { readProjectFile } from "./filesystem.js";
import { extractFormFacts, type FormFact } from "./html-forms.js";
import { actionSchemaPropertyRange } from "./locations.js";
import {
  assertRelativePosixPath,
  compareText,
  InputFailure,
  joinProjectPath,
} from "./paths.js";

export async function checkFeatureForms(options: {
  readonly root: string;
  readonly featureContractPath: string;
  readonly featureText: string;
  readonly feature: FeatureContract;
  readonly discovered: ReadonlySet<string>;
  readonly maxFileBytes: number;
}): Promise<readonly Diagnostic[]> {
  const featureRoot = path.posix.dirname(options.featureContractPath);
  const templateCache = new Map<string, readonly FormFact[]>();
  const diagnostics: FormFieldMissingDiagnostic[] = [];

  for (let actionIndex = 0; actionIndex < options.feature.actions.length; actionIndex += 1) {
    const action = options.feature.actions[actionIndex];
    if (action === undefined) {
      continue;
    }
    const templateFile = assertRelativePosixPath(
      action.form.template,
      "form template",
    );
    const projectTemplate = joinProjectPath(featureRoot, templateFile);
    if (!options.discovered.has(projectTemplate)) {
      throw new InputFailure(
        "configuration",
        "form.template_not_discovered",
        `Form template ${JSON.stringify(projectTemplate)} is not a discovered source file.`,
        projectTemplate,
      );
    }

    let forms = templateCache.get(projectTemplate);
    if (forms === undefined) {
      const html = await readProjectFile(
        options.root,
        projectTemplate,
        options.maxFileBytes,
      );
      forms = extractFormFacts(html);
      templateCache.set(projectTemplate, forms);
    }
    const matchingForms = forms.filter((form) => form.id === action.form.id);
    if (matchingForms.length !== 1) {
      throw new InputFailure(
        "configuration",
        matchingForms.length === 0 ? "form.not_found" : "form.id_duplicate",
        matchingForms.length === 0
          ? `Form ${JSON.stringify(action.form.id)} was not found in ${JSON.stringify(projectTemplate)}.`
          : `Form id ${JSON.stringify(action.form.id)} appears more than once in ${JSON.stringify(projectTemplate)}.`,
        projectTemplate,
      );
    }
    const form = matchingForms[0];
    if (form === undefined) {
      continue;
    }

    for (const fieldName of [...action.input.schema.required].sort(compareText)) {
      if (!Object.hasOwn(action.input.schema.properties, fieldName)) {
        throw new InputFailure(
          "configuration",
          "schema.required_property_missing",
          `Required action field ${JSON.stringify(fieldName)} has no schema property.`,
          options.featureContractPath,
        );
      }
      const binding = action.input.formCodec.bindings.find(
        (candidate) =>
          candidate.path.length === 1 && candidate.path[0] === fieldName,
      );
      if (binding === undefined) {
        throw new InputFailure(
          "configuration",
          "form.binding_missing",
          `Required action field ${JSON.stringify(fieldName)} has no form codec binding.`,
          options.featureContractPath,
        );
      }
      if (form.fields.includes(binding.name)) {
        continue;
      }
      diagnostics.push(
        missingFieldDiagnostic({
          actionId: action.id,
          actionIndex,
          fieldName,
          form,
          templateFile: projectTemplate,
          featureContractPath: options.featureContractPath,
          featureText: options.featureText,
        }),
      );
    }
  }

  return diagnostics;
}

function missingFieldDiagnostic(options: {
  readonly actionId: string;
  readonly actionIndex: number;
  readonly fieldName: string;
  readonly form: FormFact;
  readonly templateFile: string;
  readonly featureContractPath: string;
  readonly featureText: string;
}): FormFieldMissingDiagnostic {
  return {
    code: "form.field_missing",
    severity: "error",
    category: "form-contract",
    message: `Form ${JSON.stringify(options.form.id)} is missing required field ${JSON.stringify(options.fieldName)}.`,
    file: options.templateFile,
    range: options.form.range,
    facts: {
      actionId: options.actionId,
      fieldName: options.fieldName,
      formId: options.form.id,
      schemaPath: [options.fieldName],
      template: options.templateFile,
    },
    related: [
      {
        role: "action-input-field",
        message: "The action input requires this field.",
        file: options.featureContractPath,
        range: actionSchemaPropertyRange(
          options.featureText,
          options.actionIndex,
          options.fieldName,
        ),
      },
    ],
    repair: {
      strategy: "add-missing-form-control",
      hint: `Add a named control bound to ${options.fieldName} in form ${options.form.id}.`,
      mustPreserve: [
        `action input requirement for ${options.fieldName}`,
        "form-to-action linkage",
      ],
      mustNot: [
        `make ${options.fieldName} optional`,
        `remove ${options.fieldName} from the action input contract`,
      ],
    },
  };
}
