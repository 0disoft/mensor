import {
  parse,
  type DefaultTreeAdapterTypes,
} from "parse5";

import type { SourceRange } from "@0disoft/mensor-contract";

import type { CompilerTiming } from "./compiler-timing.js";
import {
  createContentDigest,
  parseFormIndex,
  serializeFormIndex,
  verifyFormIndexContent,
  type FormDocumentFact,
  type FormIndex,
  type IndexedControlFact,
  type IndexedEvidence,
  type IndexedFormFact,
  type UnsupportedReason,
} from "./form-index.js";
import { compareText } from "./paths.js";

const staticHtmlSourceKind = "mensor/static-html";

export interface StaticHtmlFormIndexProvider {
  readonly getIndex: (
    documentPaths: readonly string[],
  ) => Promise<FormIndex>;
}

export function createStaticHtmlFormIndexProvider(options: {
  readonly producerVersion: string;
  readonly readSource: (documentPath: string) => Promise<string>;
  readonly timing?: CompilerTiming;
}): StaticHtmlFormIndexProvider {
  const documents = new Map<string, Promise<FormDocumentFact>>();
  const sources = new Map<string, string>();

  async function getDocument(documentPath: string): Promise<FormDocumentFact> {
    let document = documents.get(documentPath);
    if (document === undefined) {
      const extract = async (): Promise<FormDocumentFact> => {
        const source = options.timing === undefined
          ? await options.readSource(documentPath)
          : await options.timing.measure(
              "templateRead",
              () => options.readSource(documentPath),
            );
        sources.set(documentPath, source);
        options.timing?.recordTemplateSource(source);
        return options.timing === undefined
          ? extractStaticHtmlFormDocument(documentPath, source)
          : options.timing.measureSync(
              "templateExtraction",
              () => extractStaticHtmlFormDocument(documentPath, source),
            );
      };
      document = extract();
      documents.set(documentPath, document);
    }
    return document;
  }

  return {
    async getIndex(documentPaths) {
      const uniquePaths = [...new Set(documentPaths)].sort(compareText);
      const indexedDocuments: FormDocumentFact[] = [];
      for (const documentPath of uniquePaths) {
        indexedDocuments.push(await getDocument(documentPath));
      }
      const validate = (): FormIndex => {
        const serialized = serializeFormIndex({
          schemaVersion: 1,
          producer: {
            name: staticHtmlSourceKind,
            version: options.producerVersion,
          },
          documents: indexedDocuments,
        });
        const parsed = parseFormIndex(serialized);
        return verifyFormIndexContent(parsed, (documentPath) =>
          sources.get(documentPath),
        );
      };
      return options.timing === undefined
        ? validate()
        : options.timing.measureSync("formIndexValidation", validate);
    },
  };
}

export function extractStaticHtmlFormDocument(
  documentPath: string,
  html: string,
): FormDocumentFact {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const elements: DefaultTreeAdapterTypes.Element[] = [];
  collectElements(document.childNodes, elements);
  const forms = elements.filter((element) => element.tagName === "form");
  const controls = elements.filter(isFormControl);

  return {
    path: documentPath,
    contentDigest: createContentDigest(html),
    sourceKind: staticHtmlSourceKind,
    inspection: { state: "complete" },
    forms: forms.map((form) => indexedFormFact(form, forms, controls)),
  };
}

function indexedFormFact(
  form: DefaultTreeAdapterTypes.Element,
  forms: readonly DefaultTreeAdapterTypes.Element[],
  controls: readonly DefaultTreeAdapterTypes.Element[],
): IndexedFormFact {
  const ownedControls = controls.filter(
    (control) => associatedForm(control, forms) === form,
  );
  return {
    identity: stringAttributeEvidence(form, "id"),
    method: methodEvidence(form),
    action: actionEvidence(form),
    range: elementStartTagRange(form),
    controls: ownedControls.map((control) =>
      indexedControlFact(control, ownedControls),
    ),
  };
}

function indexedControlFact(
  control: DefaultTreeAdapterTypes.Element,
  ownedControls: readonly DefaultTreeAdapterTypes.Element[],
): IndexedControlFact {
  const range = elementStartTagRange(control);
  const kind = control.tagName as "button" | "input" | "select" | "textarea";
  const inputType = controlInputType(control);
  return {
    name: stringAttributeEvidence(control, "name"),
    controlKind: known(kind, range),
    inputType: known(inputType, range),
    multiple: known(attribute(control, "multiple") !== null, range),
    multiplicity: known(controlMultiplicity(control, ownedControls), range),
    successful: successfulEvidence(control, inputType, range),
    range,
  };
}

function methodEvidence(
  form: DefaultTreeAdapterTypes.Element,
): IndexedFormFact["method"] {
  const value = attribute(form, "method");
  const range = elementAttributeRange(form, "method");
  return value === null
    ? { state: "absent", range }
    : known(asciiLowercase(value), range);
}

function actionEvidence(
  form: DefaultTreeAdapterTypes.Element,
): IndexedFormFact["action"] {
  const value = attribute(form, "action");
  const range = elementAttributeRange(form, "action");
  return value === null || value.length === 0
    ? { state: "current-document", range }
    : known(value, range);
}

function stringAttributeEvidence(
  element: DefaultTreeAdapterTypes.Element,
  name: string,
): IndexedEvidence<string> {
  const value = attribute(element, name);
  const range = elementAttributeRange(element, name);
  return value === null || value.length === 0
    ? { state: "absent", range }
    : known(value, range);
}

function successfulEvidence(
  control: DefaultTreeAdapterTypes.Element,
  inputType: string,
  range: SourceRange,
): IndexedControlFact["successful"] {
  if (isEffectivelyDisabled(control)) {
    return known(false, range);
  }
  const unsupportedReason = unsupportedControlReason(control, inputType);
  if (unsupportedReason !== undefined) {
    return {
      state: "unsupported",
      reason: unsupportedReason,
      range,
    };
  }
  return known(isSuccessfulFieldCandidate(control), range);
}

function unsupportedControlReason(
  control: DefaultTreeAdapterTypes.Element,
  inputType: string,
): UnsupportedReason | undefined {
  const name = attribute(control, "name") ?? "";
  const isSubmitter =
    control.tagName === "button" ||
    (control.tagName === "input" && ["image", "submit"].includes(inputType));
  if (
    isSubmitter &&
    (attribute(control, "formaction") !== null ||
      attribute(control, "formmethod") !== null)
  ) {
    return "submitter-route-override";
  }
  if (isSubmitter && name.length > 0) {
    return "named-submitter";
  }
  if (control.tagName === "input" && inputType === "file" && name.length > 0) {
    return "file-input";
  }
  return undefined;
}

function controlMultiplicity(
  control: DefaultTreeAdapterTypes.Element,
  ownedControls: readonly DefaultTreeAdapterTypes.Element[],
): "mutually-exclusive" | "repeated" | "scalar" {
  const name = attribute(control, "name");
  if (name === null || name.length === 0 || !isSuccessfulFieldCandidate(control)) {
    return "scalar";
  }
  const group = ownedControls.filter(
    (candidate) =>
      attribute(candidate, "name") === name &&
      isSuccessfulFieldCandidate(candidate),
  );
  if (
    group.length > 0 &&
    group.every(
      (candidate) =>
        candidate.tagName === "input" && controlInputType(candidate) === "radio",
    )
  ) {
    return "mutually-exclusive";
  }
  if (
    (control.tagName === "select" && attribute(control, "multiple") !== null) ||
    group.length > 1
  ) {
    return "repeated";
  }
  return "scalar";
}

function known<T>(value: T, range: SourceRange): IndexedEvidence<T> {
  return { state: "known", value, range };
}

function controlInputType(element: DefaultTreeAdapterTypes.Element): string {
  if (element.tagName === "input") {
    return asciiLowercase(attribute(element, "type") ?? "text");
  }
  if (element.tagName === "button") {
    return asciiLowercase(attribute(element, "type") ?? "submit");
  }
  return "";
}

function asciiLowercase(value: string): string {
  return value.replace(/[A-Z]/gu, (character) =>
    String.fromCharCode(character.charCodeAt(0) + 32),
  );
}

function collectElements(
  nodes: readonly DefaultTreeAdapterTypes.ChildNode[],
  result: DefaultTreeAdapterTypes.Element[],
): void {
  for (const node of nodes) {
    if (!("tagName" in node)) {
      continue;
    }
    result.push(node);
    collectElements(node.childNodes, result);
  }
}

function isFormControl(element: DefaultTreeAdapterTypes.Element): boolean {
  return ["button", "input", "select", "textarea"].includes(element.tagName);
}

function isSuccessfulFieldCandidate(
  element: DefaultTreeAdapterTypes.Element,
): boolean {
  if (isEffectivelyDisabled(element) || element.tagName === "button") {
    return false;
  }
  if (element.tagName !== "input") {
    return true;
  }
  const type = controlInputType(element);
  return !["button", "file", "image", "reset", "submit"].includes(type);
}

function isEffectivelyDisabled(element: DefaultTreeAdapterTypes.Element): boolean {
  if (attribute(element, "disabled") !== null) {
    return true;
  }
  let parent = element.parentNode;
  while (parent !== null) {
    if (
      "tagName" in parent &&
      parent.tagName === "fieldset" &&
      attribute(parent, "disabled") !== null
    ) {
      const firstLegend = parent.childNodes.find(
        (child): child is DefaultTreeAdapterTypes.Element =>
          "tagName" in child && child.tagName === "legend",
      );
      if (firstLegend === undefined || !isDescendantOf(element, firstLegend)) {
        return true;
      }
    }
    parent = "parentNode" in parent ? parent.parentNode : null;
  }
  return false;
}

function isDescendantOf(
  element: DefaultTreeAdapterTypes.Element,
  ancestor: DefaultTreeAdapterTypes.Element,
): boolean {
  let parent = element.parentNode;
  while (parent !== null) {
    if (parent === ancestor) {
      return true;
    }
    parent = "parentNode" in parent ? parent.parentNode : null;
  }
  return false;
}

function associatedForm(
  control: DefaultTreeAdapterTypes.Element,
  forms: readonly DefaultTreeAdapterTypes.Element[],
): DefaultTreeAdapterTypes.Element | undefined {
  const explicitForm = attribute(control, "form");
  if (explicitForm !== null) {
    return forms.find((form) => attribute(form, "id") === explicitForm);
  }

  let parent = control.parentNode;
  while (parent !== null) {
    if ("tagName" in parent && parent.tagName === "form") {
      return parent;
    }
    parent = "parentNode" in parent ? parent.parentNode : null;
  }
  return undefined;
}

function attribute(
  element: DefaultTreeAdapterTypes.Element,
  name: string,
): string | null {
  return element.attrs.find((entry) => entry.name === name)?.value ?? null;
}

function elementStartTagRange(
  element: DefaultTreeAdapterTypes.Element,
): SourceRange {
  const location = element.sourceCodeLocation?.startTag ?? element.sourceCodeLocation;
  if (location === undefined || location === null) {
    return {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    };
  }
  return {
    start: {
      line: location.startLine - 1,
      character: location.startCol - 1,
    },
    end: {
      line: location.endLine - 1,
      character: location.endCol - 1,
    },
  };
}

function elementAttributeRange(
  element: DefaultTreeAdapterTypes.Element,
  name: string,
): SourceRange {
  const location = element.sourceCodeLocation?.attrs?.[name];
  if (location === undefined) {
    return elementStartTagRange(element);
  }
  return {
    start: {
      line: location.startLine - 1,
      character: location.startCol - 1,
    },
    end: {
      line: location.endLine - 1,
      character: location.endCol - 1,
    },
  };
}
