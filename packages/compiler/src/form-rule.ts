import * as path from "node:path";

import type {
  Diagnostic,
  FeatureContract,
  FormActionMismatchDiagnostic,
  FormFieldMissingDiagnostic,
  FormFieldUnexpectedDiagnostic,
  FormMethodMismatchDiagnostic,
} from "@mensor/contract";

import { readProjectFile } from "./filesystem.js";
import { extractFormFacts, type FormFact } from "./html-forms.js";
import {
  actionFormCodecPropertyRange,
  actionRoutePropertyRange,
  actionSchemaPropertyRange,
} from "./locations.js";
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
  const diagnostics: Diagnostic[] = [];

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

    if (form.method !== action.route.method) {
      diagnostics.push(
        methodMismatchDiagnostic({
          actionId: action.id,
          actionIndex,
          actualMethod: form.method,
          expectedMethod: action.route.method,
          form,
          templateFile: projectTemplate,
          featureContractPath: options.featureContractPath,
          featureText: options.featureText,
        }),
      );
    }
    if (form.action !== action.route.path) {
      diagnostics.push(
        actionMismatchDiagnostic({
          actionId: action.id,
          actionIndex,
          actualAction: form.action,
          expectedAction: action.route.path,
          form,
          templateFile: projectTemplate,
          featureContractPath: options.featureContractPath,
          featureText: options.featureText,
        }),
      );
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
      if (form.fields.some((field) => field.name === binding.name)) {
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

    const acceptedFieldNames = new Set([
      ...action.input.formCodec.bindings.map((binding) => binding.name),
      ...(action.input.formCodec.ignoredFields ?? []).map((field) => field.name),
    ]);
    for (const field of form.fields) {
      if (acceptedFieldNames.has(field.name)) {
        continue;
      }
      diagnostics.push(
        unexpectedFieldDiagnostic({
          actionId: action.id,
          actionIndex,
          fieldName: field.name,
          fieldRange: field.range,
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

function methodMismatchDiagnostic(options: {
  readonly actionId: string;
  readonly actionIndex: number;
  readonly actualMethod: string;
  readonly expectedMethod: "POST";
  readonly form: FormFact;
  readonly templateFile: string;
  readonly featureContractPath: string;
  readonly featureText: string;
}): FormMethodMismatchDiagnostic {
  return {
    code: "form.method_mismatch",
    severity: "error",
    category: "form-contract",
    message: `Form ${JSON.stringify(options.form.id)} uses method ${JSON.stringify(options.actualMethod)}, but action ${JSON.stringify(options.actionId)} requires ${JSON.stringify(options.expectedMethod)}.`,
    file: options.templateFile,
    range: options.form.methodRange,
    facts: {
      actionId: options.actionId,
      actualMethod: options.actualMethod,
      expectedMethod: options.expectedMethod,
      formId: options.form.id,
      template: options.templateFile,
    },
    related: [
      {
        role: "action-route-method",
        message: "The action contract declares the required HTTP method.",
        file: options.featureContractPath,
        range: actionRoutePropertyRange(
          options.featureText,
          options.actionIndex,
          "method",
        ),
      },
    ],
    repair: {
      strategy: "align-form-method",
      hint: `Set form ${options.form.id} method to ${options.expectedMethod}.`,
      mustPreserve: [
        `action ${options.actionId}`,
        `route method ${options.expectedMethod}`,
        "form-to-action linkage",
      ],
      mustNot: [
        "change the action route to match an accidental form method",
        "remove the form-to-action linkage",
      ],
    },
  };
}

function actionMismatchDiagnostic(options: {
  readonly actionId: string;
  readonly actionIndex: number;
  readonly actualAction: string;
  readonly expectedAction: string;
  readonly form: FormFact;
  readonly templateFile: string;
  readonly featureContractPath: string;
  readonly featureText: string;
}): FormActionMismatchDiagnostic {
  return {
    code: "form.action_mismatch",
    severity: "error",
    category: "form-contract",
    message: `Form ${JSON.stringify(options.form.id)} submits to ${JSON.stringify(options.actualAction)}, but action ${JSON.stringify(options.actionId)} requires ${JSON.stringify(options.expectedAction)}.`,
    file: options.templateFile,
    range: options.form.actionRange,
    facts: {
      actionId: options.actionId,
      actualAction: options.actualAction,
      expectedAction: options.expectedAction,
      formId: options.form.id,
      template: options.templateFile,
    },
    related: [
      {
        role: "action-route-path",
        message: "The action contract declares the required submission path.",
        file: options.featureContractPath,
        range: actionRoutePropertyRange(
          options.featureText,
          options.actionIndex,
          "path",
        ),
      },
    ],
    repair: {
      strategy: "align-form-action",
      hint: `Set form ${options.form.id} action to ${options.expectedAction}.`,
      mustPreserve: [
        `action ${options.actionId}`,
        `route path ${options.expectedAction}`,
        "form-to-action linkage",
      ],
      mustNot: [
        "change the action route to match an accidental form target",
        "remove the form-to-action linkage",
      ],
    },
  };
}

function unexpectedFieldDiagnostic(options: {
  readonly actionId: string;
  readonly actionIndex: number;
  readonly fieldName: string;
  readonly fieldRange: FormFact["range"];
  readonly form: FormFact;
  readonly templateFile: string;
  readonly featureContractPath: string;
  readonly featureText: string;
}): FormFieldUnexpectedDiagnostic {
  return {
    code: "form.field_unexpected",
    severity: "error",
    category: "form-contract",
    message: `Form ${JSON.stringify(options.form.id)} contains unexpected field ${JSON.stringify(options.fieldName)}.`,
    file: options.templateFile,
    range: options.fieldRange,
    facts: {
      actionId: options.actionId,
      fieldName: options.fieldName,
      formId: options.form.id,
      template: options.templateFile,
      unknownFieldsPolicy: "reject",
    },
    related: [
      {
        role: "unknown-fields-policy",
        message: "The form codec rejects fields that are neither bound nor explicitly ignored.",
        file: options.featureContractPath,
        range: actionFormCodecPropertyRange(
          options.featureText,
          options.actionIndex,
          "unknownFields",
        ),
      },
    ],
    repair: {
      strategy: "declare-or-remove-unexpected-form-field",
      hint: `Bind field ${options.fieldName}, declare it as ignored with its consumer, or remove the control.`,
      mustPreserve: [
        "unknown field rejection",
        `action ${options.actionId}`,
        "form-to-action linkage",
      ],
      mustNot: [
        "weaken the unknown field policy",
        `silently discard ${options.fieldName} at runtime`,
      ],
    },
  };
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
