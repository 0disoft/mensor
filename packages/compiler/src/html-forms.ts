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
const formControlTagNames = ["button", "input", "select", "textarea"] as const;
type FormControlTagName = (typeof formControlTagNames)[number];
type FormControlElement = DefaultTreeAdapterTypes.Element & {
  readonly tagName: FormControlTagName;
};

interface ControlState {
  readonly disabled: boolean;
  readonly inputType: string;
  readonly owner: DefaultTreeAdapterTypes.Element | undefined;
  readonly successfulCandidate: boolean;
}

interface HtmlElementIndex {
  readonly controls: readonly FormControlElement[];
  readonly disabledByAncestor: ReadonlyMap<DefaultTreeAdapterTypes.Element, boolean>;
  readonly firstElementById: ReadonlyMap<string, DefaultTreeAdapterTypes.Element>;
  readonly forms: readonly DefaultTreeAdapterTypes.Element[];
  readonly nearestForm: ReadonlyMap<FormControlElement, DefaultTreeAdapterTypes.Element>;
}

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
  const index = collectElementIndex(document.childNodes);
  const controlStates = new Map<FormControlElement, ControlState>();
  const controlsByForm = new Map<DefaultTreeAdapterTypes.Element, FormControlElement[]>();
  const groupsByForm = new Map<DefaultTreeAdapterTypes.Element, Map<string, FormControlElement[]>>();
  for (const control of index.controls) {
    const owner = associatedForm(control, index);
    const inputType = controlInputType(control);
    const disabled = attribute(control, "disabled") !== null ||
      index.disabledByAncestor.get(control) === true;
    const state: ControlState = {
      disabled,
      inputType,
      owner,
      successfulCandidate: isSuccessfulFieldCandidate(control, inputType, disabled),
    };
    controlStates.set(control, state);
    if (owner === undefined) {
      continue;
    }
    appendMapArray(controlsByForm, owner, control);
    const name = attribute(control, "name");
    if (state.successfulCandidate && name !== null && name.length > 0) {
      let groups = groupsByForm.get(owner);
      if (groups === undefined) {
        groups = new Map();
        groupsByForm.set(owner, groups);
      }
      appendMapArray(groups, name, control);
    }
  }

  return {
    path: documentPath,
    contentDigest: createContentDigest(html),
    sourceKind: staticHtmlSourceKind,
    inspection: { state: "complete" },
    forms: index.forms.map((form) => indexedFormFact(
      form,
      controlsByForm.get(form) ?? [],
      groupsByForm.get(form) ?? new Map(),
      controlStates,
    )),
  };
}

function indexedFormFact(
  form: DefaultTreeAdapterTypes.Element,
  ownedControls: readonly FormControlElement[],
  nameGroups: ReadonlyMap<string, readonly FormControlElement[]>,
  controlStates: ReadonlyMap<FormControlElement, ControlState>,
): IndexedFormFact {
  return {
    identity: stringAttributeEvidence(form, "id"),
    method: methodEvidence(form),
    action: actionEvidence(form),
    range: elementStartTagRange(form),
    controls: ownedControls.map((control) =>
      indexedControlFact(control, nameGroups, controlStates),
    ),
  };
}

function indexedControlFact(
  control: FormControlElement,
  nameGroups: ReadonlyMap<string, readonly FormControlElement[]>,
  controlStates: ReadonlyMap<FormControlElement, ControlState>,
): IndexedControlFact {
  const range = elementStartTagRange(control);
  const state = controlStates.get(control);
  if (state === undefined) {
    throw new Error("Missing indexed control state.");
  }
  return {
    name: stringAttributeEvidence(control, "name"),
    controlKind: known(control.tagName, range),
    inputType: known(state.inputType, range),
    multiple: known(attribute(control, "multiple") !== null, range),
    multiplicity: known(controlMultiplicity(control, nameGroups, state), range),
    successful: successfulEvidence(control, state, range),
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
  state: ControlState,
  range: SourceRange,
): IndexedControlFact["successful"] {
  if (state.disabled) {
    return known(false, range);
  }
  const unsupportedReason = unsupportedControlReason(control, state.inputType);
  if (unsupportedReason !== undefined) {
    return {
      state: "unsupported",
      reason: unsupportedReason,
      range,
    };
  }
  return known(state.successfulCandidate, range);
}

function unsupportedControlReason(
  control: DefaultTreeAdapterTypes.Element,
  inputType: string,
): UnsupportedReason | undefined {
  const name = attribute(control, "name") ?? "";
  const isSubmitter =
    (control.tagName === "button" && inputType === "submit") ||
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
  control: FormControlElement,
  nameGroups: ReadonlyMap<string, readonly FormControlElement[]>,
  state: ControlState,
): "mutually-exclusive" | "repeated" | "scalar" {
  const name = attribute(control, "name");
  if (name === null || name.length === 0 || !state.successfulCandidate) {
    return "scalar";
  }
  const group = nameGroups.get(name) ?? [];
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
    const value = asciiLowercase(attribute(element, "type") ?? "text");
    return inputTypes.has(value) ? value : "text";
  }
  if (element.tagName === "button") {
    const value = asciiLowercase(attribute(element, "type") ?? "submit");
    return buttonTypes.has(value) ? value : "submit";
  }
  return "";
}

const buttonTypes = new Set(["button", "reset", "submit"]);
const inputTypes = new Set([
  "button", "checkbox", "color", "date", "datetime-local", "email", "file",
  "hidden", "image", "month", "number", "password", "radio", "range",
  "reset", "search", "submit", "tel", "text", "time", "url", "week",
]);

function asciiLowercase(value: string): string {
  return value.replace(/[A-Z]/gu, (character) =>
    String.fromCharCode(character.charCodeAt(0) + 32),
  );
}

function collectElementIndex(
  nodes: readonly DefaultTreeAdapterTypes.ChildNode[],
): HtmlElementIndex {
  const controls: FormControlElement[] = [];
  const disabledByAncestor = new Map<DefaultTreeAdapterTypes.Element, boolean>();
  const firstElementById = new Map<string, DefaultTreeAdapterTypes.Element>();
  const forms: DefaultTreeAdapterTypes.Element[] = [];
  const nearestForm = new Map<FormControlElement, DefaultTreeAdapterTypes.Element>();
  const stack = [...nodes].reverse().map((node) => ({
    ancestorDisabled: false,
    nearestForm: undefined as DefaultTreeAdapterTypes.Element | undefined,
    node,
  }));
  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) {
      continue;
    }
    const { node } = frame;
    if (!("tagName" in node)) {
      continue;
    }
    disabledByAncestor.set(node, frame.ancestorDisabled);
    const id = attribute(node, "id");
    if (id !== null && id.length > 0 && !firstElementById.has(id)) {
      firstElementById.set(id, node);
    }
    const currentForm = node.tagName === "form" ? node : frame.nearestForm;
    if (node.tagName === "form") {
      forms.push(node);
    }
    if (isFormControl(node)) {
      controls.push(node);
      if (frame.nearestForm !== undefined) {
        nearestForm.set(node, frame.nearestForm);
      }
    }
    const disabledFieldset = node.tagName === "fieldset" &&
      attribute(node, "disabled") !== null;
    const firstLegend = disabledFieldset
      ? node.childNodes.find(
          (child): child is DefaultTreeAdapterTypes.Element =>
            "tagName" in child && child.tagName === "legend",
        )
      : undefined;
    for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
      const child = node.childNodes[index];
      if (child !== undefined) {
        stack.push({
          ancestorDisabled: frame.ancestorDisabled ||
            (disabledFieldset && child !== firstLegend),
          nearestForm: currentForm,
          node: child,
        });
      }
    }
  }
  return { controls, disabledByAncestor, firstElementById, forms, nearestForm };
}

function isFormControl(
  element: DefaultTreeAdapterTypes.Element,
): element is FormControlElement {
  return formControlTagNames.some((tagName) => tagName === element.tagName);
}

function isSuccessfulFieldCandidate(
  element: DefaultTreeAdapterTypes.Element,
  inputType: string,
  disabled: boolean,
): boolean {
  if (disabled || element.tagName === "button") {
    return false;
  }
  if (element.tagName !== "input") {
    return true;
  }
  return !["button", "file", "image", "reset", "submit"].includes(inputType);
}

function associatedForm(
  control: FormControlElement,
  index: HtmlElementIndex,
): DefaultTreeAdapterTypes.Element | undefined {
  const explicitForm = attribute(control, "form");
  if (explicitForm !== null) {
    const owner = index.firstElementById.get(explicitForm);
    return owner?.tagName === "form" ? owner : undefined;
  }
  return index.nearestForm.get(control);
}

function appendMapArray<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const values = map.get(key);
  if (values === undefined) {
    map.set(key, [value]);
  } else {
    values.push(value);
  }
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
