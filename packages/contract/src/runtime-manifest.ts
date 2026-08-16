import { compareText } from "./compare.js";
import { parseJsonc } from "./jsonc.js";
import { schemaIssues, validateRuntimeManifest } from "./schemas.js";
import type {
  ContractIssue,
  ContractResult,
  FormBinding,
  IgnoredFormField,
  PropertySchema,
  RuntimeAction,
  RuntimeManifest,
  RuntimePage,
} from "./types.js";

export function parseRuntimeManifest(text: string): ContractResult<RuntimeManifest> {
  const parsed = parseJsonc(text);
  if (!parsed.ok) {
    return parsed;
  }
  if (!validateRuntimeManifest(parsed.value)) {
    return { ok: false, issues: schemaIssues(validateRuntimeManifest) };
  }
  const issues = runtimeManifestSemanticIssues(parsed.value);
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  const canonical = canonicalRuntimeManifest(parsed.value);
  if (serializeRuntimeManifest(canonical) !== text) {
    return {
      ok: false,
      issues: [semanticIssue("", "RuntimeManifest must use canonical JSON encoding.")],
    };
  }
  return { ok: true, value: canonical };
}

export function serializeRuntimeManifest(value: unknown): string {
  if (!validateRuntimeManifest(value)) {
    const issue = schemaIssues(validateRuntimeManifest)[0];
    throw new TypeError(
      `RuntimeManifest cannot be serialized: ${issue?.message ?? "schema validation failed"}`,
    );
  }
  const issues = runtimeManifestSemanticIssues(value);
  if (issues.length > 0) {
    throw new TypeError(`RuntimeManifest cannot be serialized: ${issues[0]?.message}`);
  }
  return `${JSON.stringify(canonicalRuntimeManifest(value), null, 2)}\n`;
}

function canonicalRuntimeManifest(value: RuntimeManifest): RuntimeManifest {
  return {
    manifestVersion: 1,
    producer: {
      name: value.producer.name,
      version: value.producer.version,
    },
    pages: [...value.pages].sort(comparePages).map(canonicalPage),
    actions: [...value.actions].sort(compareActions).map(canonicalAction),
  };
}

function canonicalPage(page: RuntimePage): RuntimePage {
  return {
    id: page.id,
    method: "GET",
    path: page.path,
    html: page.html,
  };
}

function canonicalAction(action: RuntimeAction): RuntimeAction {
  return {
    id: action.id,
    method: "POST",
    path: action.path,
    handlerId: action.handlerId,
    input: {
      schema: {
        kind: "object",
        properties: Object.fromEntries(
          Object.entries(action.input.schema.properties)
            .sort(([left], [right]) => compareText(left, right))
            .map(([name, schema]) => [name, canonicalObject(schema)]),
        ) as Readonly<Record<string, PropertySchema>>,
        required: [...action.input.schema.required].sort(compareText),
      },
      formCodec: {
        encoding: "urlencoded",
        unknownFields: "reject",
        bindings: [...action.input.formCodec.bindings]
          .sort(compareBindings)
          .map((binding) => canonicalObject(binding) as unknown as FormBinding),
        ...(action.input.formCodec.ignoredFields === undefined
          ? {}
          : {
              ignoredFields: [...action.input.formCodec.ignoredFields]
                .sort(compareIgnoredFields)
                .map((field) => ({ name: field.name, consumer: field.consumer })),
            }),
      },
    },
  };
}

function canonicalObject(value: object): object {
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, child]) => [key, canonicalValue(child)]),
  );
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (typeof value === "object" && value !== null) {
    return canonicalObject(value);
  }
  return value;
}

function runtimeManifestSemanticIssues(value: RuntimeManifest): readonly ContractIssue[] {
  const issues: ContractIssue[] = [];
  const ids = new Set<string>();
  const routes = new Set<string>();
  const handlers = new Set<string>();
  value.pages.forEach((page, index) => {
    collectUnique(issues, ids, page.id, `/pages/${index}/id`, "Runtime ids must be unique.");
    collectUnique(issues, routes, `${page.method}\u0000${page.path}`, `/pages/${index}`, "Runtime routes must be unique.");
  });
  value.actions.forEach((action, index) => {
    collectUnique(issues, ids, action.id, `/actions/${index}/id`, "Runtime ids must be unique.");
    collectUnique(issues, routes, `${action.method}\u0000${action.path}`, `/actions/${index}`, "Runtime routes must be unique.");
    collectUnique(issues, handlers, action.handlerId, `/actions/${index}/handlerId`, "Runtime handler ids must be unique.");
  });
  return issues;
}

function collectUnique(
  issues: ContractIssue[],
  seen: Set<string>,
  value: string,
  instancePath: string,
  message: string,
): void {
  if (seen.has(value)) {
    issues.push(semanticIssue(instancePath, message));
  }
  seen.add(value);
}

function comparePages(left: RuntimePage, right: RuntimePage): number {
  return compareText(left.path, right.path) || compareText(left.id, right.id);
}

function compareActions(left: RuntimeAction, right: RuntimeAction): number {
  return compareText(left.path, right.path) || compareText(left.id, right.id);
}

function compareBindings(left: FormBinding, right: FormBinding): number {
  return compareText(left.name, right.name) || compareText(left.path.join("\u0000"), right.path.join("\u0000"));
}

function compareIgnoredFields(left: IgnoredFormField, right: IgnoredFormField): number {
  return compareText(left.name, right.name) || compareText(left.consumer, right.consumer);
}

function semanticIssue(instancePath: string, message: string): ContractIssue {
  return {
    code: "schema.violation",
    message,
    instancePath,
    schemaPath: "#/$semantic",
    keyword: "semantic",
  };
}
