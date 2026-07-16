import * as path from "node:path";

import type {
  Diagnostic,
  FeatureContract,
  FormActionMismatchDiagnostic,
  FormControlCodecMismatchDiagnostic,
  FormControlUnsupportedDiagnostic,
  FormFieldMissingDiagnostic,
  FormFieldUnexpectedDiagnostic,
  FormMethodMismatchDiagnostic,
} from "@mensor/contract";

import type { FormFact } from "./form-facts.js";
import { formFactsForLinkedForm } from "./form-index-semantics.js";
import type { FormIndex } from "./form-index.js";
import {
  actionFormPropertyRange,
  actionFormCodecPropertyRange,
  actionBindingDecoderKindRange,
  actionRoutePropertyRange,
  actionSchemaPropertyRange,
} from "./locations.js";
import {
  assertRelativePosixPath,
  compareText,
  InputFailure,
  joinProjectPath,
} from "./paths.js";

export function checkFeatureForms(options: {
  readonly featureContractPath: string;
  readonly featureText: string;
  readonly feature: FeatureContract;
  readonly formIndex: FormIndex;
}): readonly Diagnostic[] {
  const featureRoot = path.posix.dirname(options.featureContractPath);
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
    const matchingForms = formFactsForLinkedForm(
      options.formIndex,
      projectTemplate,
      action.form.id,
    );
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
    const resolvedAction = resolveFormAction({
      actionId: action.id,
      documentPath: action.form.documentPath,
      featureContractPath: options.featureContractPath,
      form,
    });
    if (resolvedAction.path !== action.route.path) {
      diagnostics.push(
        actionMismatchDiagnostic({
          actionId: action.id,
          actionIndex,
          actualAction: resolvedAction.path,
          actualActionSource: resolvedAction.source,
          expectedAction: action.route.path,
          form,
          templateFile: projectTemplate,
          featureContractPath: options.featureContractPath,
          featureText: options.featureText,
        }),
      );
    }

    for (const control of form.unsupportedControls) {
      diagnostics.push(
        unsupportedControlDiagnostic({
          actionId: action.id,
          form,
          control,
          templateFile: projectTemplate,
          featureContractPath: options.featureContractPath,
          featureText: options.featureText,
          actionIndex,
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

    action.input.formCodec.bindings.forEach((binding, bindingIndex) => {
      const field = form.fields.find((candidate) => candidate.name === binding.name);
      if (field === undefined) {
        return;
      }
      const repeatedControlsAreOneRadioGroup =
        field.controls.length > 1 &&
        field.controls.every(
          (control) => control.kind === "input" && control.inputType === "radio",
        );
      const incompatibleControl =
        field.controls.length > 1 && !repeatedControlsAreOneRadioGroup
          ? field.controls[1]
          : field.controls.find(
              (control) =>
                (control.kind === "input" && control.inputType === "checkbox") ||
                (control.kind === "select" && control.multiple),
            );
      if (incompatibleControl === undefined) {
        return;
      }
      diagnostics.push(
        controlCodecMismatchDiagnostic({
          actionId: action.id,
          actionIndex,
          bindingIndex,
          controlCount: field.controls.length,
          fieldName: binding.name,
          form,
          control: incompatibleControl,
          templateFile: projectTemplate,
          featureContractPath: options.featureContractPath,
          featureText: options.featureText,
        }),
      );
    });
  }

  return diagnostics;
}

function unsupportedControlDiagnostic(options: {
  readonly actionId: string;
  readonly actionIndex: number;
  readonly form: FormFact;
  readonly control: FormFact["unsupportedControls"][number];
  readonly templateFile: string;
  readonly featureContractPath: string;
  readonly featureText: string;
}): FormControlUnsupportedDiagnostic {
  const description =
    options.control.reason === "file-input"
      ? "file input"
      : options.control.reason === "named-submitter"
        ? "named submitter"
        : "submitter route override";
  return {
    code: "form.control_unsupported",
    severity: "error",
    category: "form-contract",
    message: `Form ${JSON.stringify(options.form.id)} contains unsupported ${description}.`,
    file: options.templateFile,
    range: options.control.range,
    facts: {
      actionId: options.actionId,
      controlKind: options.control.kind,
      controlType: options.control.inputType,
      fieldName: options.control.name,
      formId: options.form.id,
      reason: options.control.reason,
      template: options.templateFile,
    },
    related: [
      {
        role: "linked-action-route",
        message: "This form is linked to a static action route contract.",
        file: options.featureContractPath,
        range: actionRoutePropertyRange(
          options.featureText,
          options.actionIndex,
          "path",
        ),
      },
    ],
    repair: {
      strategy: "remove-or-model-unsupported-control",
      hint: `Remove the ${description}, or add an explicit serializable contract before relying on it.`,
      mustPreserve: [
        `action ${options.actionId}`,
        "static form-to-action linkage",
      ],
      mustNot: [
        "silently ignore the unsupported control",
        "weaken the action contract",
      ],
    },
  };
}

function controlCodecMismatchDiagnostic(options: {
  readonly actionId: string;
  readonly actionIndex: number;
  readonly bindingIndex: number;
  readonly controlCount: number;
  readonly fieldName: string;
  readonly form: FormFact;
  readonly control: FormFact["fields"][number]["controls"][number];
  readonly templateFile: string;
  readonly featureContractPath: string;
  readonly featureText: string;
}): FormControlCodecMismatchDiagnostic {
  const controlShape = options.controlCount > 1
    ? `${options.controlCount} successful controls with the same wire name`
    : options.control.kind === "input"
      ? `input[type=${options.control.inputType}]`
      : "select[multiple]";
  return {
    code: "form.control_codec_mismatch",
    severity: "error",
    category: "form-contract",
    message: `Form field ${JSON.stringify(options.fieldName)} uses ${controlShape}, which is incompatible with the text decoder.`,
    file: options.templateFile,
    range: options.control.range,
    facts: {
      actionId: options.actionId,
      controlKind: options.control.kind === "select" ? "select" : "input",
      ...(options.controlCount > 1 ? { controlCount: options.controlCount } : {}),
      controlType: options.control.inputType,
      decoderKind: "text",
      fieldName: options.fieldName,
      formId: options.form.id,
      multiple: options.control.multiple,
      template: options.templateFile,
    },
    related: [
      {
        role: "form-decoder-kind",
        message: "The form codec declares a scalar text decoder for this field.",
        file: options.featureContractPath,
        range: actionBindingDecoderKindRange(
          options.featureText,
          options.actionIndex,
          options.bindingIndex,
        ),
      },
    ],
    repair: {
      strategy: "align-control-and-decoder",
      hint: `Use a scalar text control for ${options.fieldName}, or introduce a codec that explicitly models ${controlShape}.`,
      mustPreserve: [
        `action ${options.actionId}`,
        `field binding ${options.fieldName}`,
        "form-to-action linkage",
      ],
      mustNot: [
        "coerce repeated or missing form values through the text decoder",
        "remove the field binding to hide the mismatch",
      ],
    },
  };
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
  readonly actualActionSource: "literal" | "current-document";
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
    range: options.form.action.range,
    facts: {
      actionId: options.actionId,
      actualAction: options.actualAction,
      actualActionSource: options.actualActionSource,
      expectedAction: options.expectedAction,
      formId: options.form.id,
      template: options.templateFile,
    },
    related: [
      ...(options.actualActionSource === "current-document"
        ? [{
            role: "form-document-path",
            message: "The form contract declares the current document path.",
            file: options.featureContractPath,
            range: actionFormPropertyRange(
              options.featureText,
              options.actionIndex,
              "documentPath",
            ),
          }]
        : []),
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
      hint: options.actualActionSource === "current-document"
        ? `Set form ${options.form.id} action to ${options.expectedAction}, or align its documentPath with the real page route.`
        : `Set form ${options.form.id} action to ${options.expectedAction}.`,
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

function resolveFormAction(options: {
  readonly actionId: string;
  readonly documentPath: string | undefined;
  readonly featureContractPath: string;
  readonly form: FormFact;
}): { readonly path: string; readonly source: "literal" | "current-document" } {
  if (options.form.action.kind === "literal") {
    return { path: options.form.action.value, source: "literal" };
  }
  if (options.documentPath === undefined) {
    throw new InputFailure(
      "configuration",
      "form.document_path_missing",
      `Action ${JSON.stringify(options.actionId)} links a current-document form but does not declare form.documentPath.`,
      options.featureContractPath,
    );
  }
  return { path: options.documentPath, source: "current-document" };
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
