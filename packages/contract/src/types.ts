export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type ContractIssueCode =
  | "jsonc.empty"
  | "jsonc.syntax"
  | "jsonc.duplicate_key"
  | "schema.violation";

export interface ContractIssue {
  readonly code: ContractIssueCode;
  readonly message: string;
  readonly offset?: number;
  readonly length?: number;
  readonly instancePath?: string;
  readonly schemaPath?: string;
  readonly keyword?: string;
}

export interface ContractSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export interface ContractFailure {
  readonly ok: false;
  readonly issues: readonly ContractIssue[];
}

export type ContractResult<T> = ContractSuccess<T> | ContractFailure;

export interface ProjectContract {
  readonly $schema?: string;
  readonly version: 1;
  readonly sourceRoot: string;
  readonly featureContracts: readonly string[];
  readonly fileRoles: readonly FileRoleContract[];
  readonly boundaries?: readonly BoundaryContract[];
  readonly ownershipRules?: readonly OwnershipRuleContract[];
  readonly formIndex?: string;
  readonly routeIndex?: string;
}

export type ContentDigest = `sha256:${string}`;

export interface RouteIndex {
  readonly schemaVersion: 1;
  readonly producer: {
    readonly name: string;
    readonly version: string;
  };
  readonly routes: readonly IndexedRoute[];
}

export interface IndexedRoute {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly source: {
    readonly file: string;
    readonly contentDigest: ContentDigest;
    readonly range: SourceRange;
  };
}

export type FormIndexDynamicReason =
  | "computed-attribute"
  | "conditional-presence"
  | "custom-helper-semantics"
  | "dynamic-interpolation"
  | "repeated-generation";

export type FormIndexUnsupportedReason =
  | "file-input"
  | "named-submitter"
  | "provider-resource-limit"
  | "submitter-route-override"
  | "unsupported-control-kind";

export type FormIndexEvidence<T> =
  | { readonly state: "known"; readonly value: T; readonly range: SourceRange }
  | { readonly state: "absent"; readonly range?: SourceRange }
  | {
      readonly state: "dynamic";
      readonly reason: FormIndexDynamicReason;
      readonly range: SourceRange;
    }
  | {
      readonly state: "unsupported";
      readonly reason: FormIndexUnsupportedReason;
      readonly range: SourceRange;
    };

export type FormIndexActionEvidence =
  | FormIndexEvidence<string>
  | { readonly state: "current-document"; readonly range: SourceRange };

export type FormIndexDocumentInspection =
  | { readonly state: "complete" }
  | {
      readonly state: "incomplete";
      readonly reason: FormIndexDynamicReason | FormIndexUnsupportedReason;
      readonly range?: SourceRange;
    };

export interface FormIndex {
  readonly schemaVersion: 1;
  readonly producer: {
    readonly name: string;
    readonly version: string;
  };
  readonly documents: readonly FormIndexDocument[];
}

export interface FormIndexDocument {
  readonly path: string;
  readonly contentDigest: ContentDigest;
  readonly sourceKind: string;
  readonly inspection: FormIndexDocumentInspection;
  readonly forms: readonly FormIndexForm[];
}

export interface FormIndexForm {
  readonly identity: FormIndexEvidence<string>;
  readonly method: FormIndexEvidence<string>;
  readonly action: FormIndexActionEvidence;
  readonly range: SourceRange;
  readonly controls: readonly FormIndexControl[];
}

export interface FormIndexControl {
  readonly name: FormIndexEvidence<string>;
  readonly controlKind: FormIndexEvidence<
    "button" | "input" | "select" | "textarea"
  >;
  readonly inputType: FormIndexEvidence<string>;
  readonly multiple: FormIndexEvidence<boolean>;
  readonly multiplicity: FormIndexEvidence<
    "mutually-exclusive" | "repeated" | "scalar"
  >;
  readonly successful: FormIndexEvidence<boolean>;
  readonly range: SourceRange;
}

export interface RuntimeManifest {
  readonly manifestVersion: 1;
  readonly producer: {
    readonly name: string;
    readonly version: string;
  };
  readonly pages: readonly RuntimePage[];
  readonly actions: readonly RuntimeAction[];
}

export interface RuntimePage {
  readonly id: string;
  readonly method: "GET";
  readonly path: string;
  readonly html: string;
}

export interface RuntimeAction {
  readonly id: string;
  readonly method: "POST";
  readonly path: string;
  readonly handlerId: string;
  readonly input: ActionContract["input"];
}

export interface BoundaryContract {
  readonly id: string;
  readonly mode: "direct" | "transitive";
  readonly from: readonly string[];
  readonly deny: readonly string[];
}

export interface OwnershipRuleContract {
  readonly id: string;
  readonly kind: "i18n" | "test";
  readonly suffixes: readonly string[];
  readonly withinFeature: string;
}

export interface FileRoleContract {
  readonly role: string;
  readonly withinFeature: string;
}

export interface StringSchema {
  readonly kind: "string";
  readonly minLength?: number;
  readonly maxLength?: number;
}

export interface IntegerSchema {
  readonly kind: "integer";
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface NumberSchema {
  readonly kind: "number";
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface BooleanSchema {
  readonly kind: "boolean";
}

export interface EnumSchema {
  readonly kind: "enum";
  readonly values: readonly string[];
}

export type ScalarSchema =
  | StringSchema
  | IntegerSchema
  | NumberSchema
  | BooleanSchema
  | EnumSchema;

export interface ArraySchema {
  readonly kind: "array";
  readonly items: ScalarSchema;
  readonly minItems?: number;
  readonly maxItems?: number;
}

export type PropertySchema = ScalarSchema | ArraySchema;

export interface ObjectSchema {
  readonly kind: "object";
  readonly properties: Readonly<Record<string, PropertySchema>>;
  readonly required: readonly string[];
}

export interface TextDecoder {
  readonly kind: "text";
  readonly trim: boolean;
  readonly empty: "allow" | "reject";
}

export interface IntegerDecoder {
  readonly kind: "integer-base10";
}

export interface DecimalDecoder {
  readonly kind: "decimal";
}

export interface CheckboxDecoder {
  readonly kind: "checkbox";
  readonly trueValues: readonly string[];
  readonly missing: boolean;
}

export interface EnumDecoder {
  readonly kind: "enum";
  readonly values: readonly string[];
}

export type ScalarDecoder =
  | TextDecoder
  | IntegerDecoder
  | DecimalDecoder
  | CheckboxDecoder
  | EnumDecoder;

export type RepeatItemDecoder =
  | TextDecoder
  | IntegerDecoder
  | DecimalDecoder
  | EnumDecoder;

export interface RepeatDecoder {
  readonly kind: "repeat";
  readonly items: RepeatItemDecoder;
}

export type FormDecoder = ScalarDecoder | RepeatDecoder;

export interface FormBinding {
  readonly name: string;
  readonly path: readonly string[];
  readonly decode: FormDecoder;
}

export interface IgnoredFormField {
  readonly name: string;
  readonly consumer: string;
}

export interface FormCodec {
  readonly encoding: "urlencoded";
  readonly unknownFields: "reject";
  readonly bindings: readonly FormBinding[];
  readonly ignoredFields?: readonly IgnoredFormField[];
}

export interface ActionContract {
  readonly id: string;
  readonly route: {
    readonly method: "POST";
    readonly path: string;
  };
  readonly form: {
    readonly template: string;
    readonly id: string;
    readonly documentPath?: string;
  };
  readonly handler: {
    readonly file: string;
    readonly export: string;
    readonly role: string;
  };
  readonly input: {
    readonly schema: ObjectSchema;
    readonly formCodec: FormCodec;
  };
}

export interface FeatureContract {
  readonly $schema?: string;
  readonly version: 1;
  readonly feature: {
    readonly id: string;
  };
  readonly actions: readonly ActionContract[];
}

export interface SourcePosition {
  readonly line: number;
  readonly character: number;
}

export interface SourceRange {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

export interface RelatedLocation {
  readonly role: string;
  readonly message: string;
  readonly file: string;
  readonly range: SourceRange;
}

export interface RepairInstruction {
  readonly strategy: string;
  readonly hint: string;
  readonly mustPreserve: readonly string[];
  readonly mustNot: readonly string[];
}

export interface FormFieldMissingFacts {
  readonly actionId: string;
  readonly fieldName: string;
  readonly formId: string;
  readonly schemaPath: readonly string[];
  readonly template: string;
}

export interface FormFieldMissingDiagnostic {
  readonly code: "form.field_missing";
  readonly severity: "error";
  readonly category: "form-contract";
  readonly message: string;
  readonly file: string;
  readonly range: SourceRange;
  readonly facts: FormFieldMissingFacts;
  readonly related: readonly RelatedLocation[];
  readonly repair: RepairInstruction;
}

export interface FormFieldUnexpectedFacts {
  readonly actionId: string;
  readonly fieldName: string;
  readonly formId: string;
  readonly template: string;
  readonly unknownFieldsPolicy: "reject";
}

export interface FormFieldUnexpectedDiagnostic {
  readonly code: "form.field_unexpected";
  readonly severity: "error";
  readonly category: "form-contract";
  readonly message: string;
  readonly file: string;
  readonly range: SourceRange;
  readonly facts: FormFieldUnexpectedFacts;
  readonly related: readonly RelatedLocation[];
  readonly repair: RepairInstruction;
}

export interface FormMethodMismatchFacts {
  readonly actionId: string;
  readonly actualMethod: string;
  readonly expectedMethod: "POST";
  readonly formId: string;
  readonly template: string;
}

export interface FormMethodMismatchDiagnostic {
  readonly code: "form.method_mismatch";
  readonly severity: "error";
  readonly category: "form-contract";
  readonly message: string;
  readonly file: string;
  readonly range: SourceRange;
  readonly facts: FormMethodMismatchFacts;
  readonly related: readonly RelatedLocation[];
  readonly repair: RepairInstruction;
}

export interface FormActionMismatchFacts {
  readonly actionId: string;
  readonly actualAction: string;
  readonly actualActionSource: "literal" | "current-document";
  readonly expectedAction: string;
  readonly formId: string;
  readonly template: string;
}

export interface FormActionMismatchDiagnostic {
  readonly code: "form.action_mismatch";
  readonly severity: "error";
  readonly category: "form-contract";
  readonly message: string;
  readonly file: string;
  readonly range: SourceRange;
  readonly facts: FormActionMismatchFacts;
  readonly related: readonly RelatedLocation[];
  readonly repair: RepairInstruction;
}

export interface FormControlCodecMismatchFacts {
  readonly actionId: string;
  readonly controlKind: "input" | "select" | "textarea";
  readonly controlCount?: number;
  readonly controlType: string;
  readonly decoderKind: FormDecoder["kind"];
  readonly fieldName: string;
  readonly formId: string;
  readonly multiple: boolean;
  readonly template: string;
}

export interface FormControlCodecMismatchDiagnostic {
  readonly code: "form.control_codec_mismatch";
  readonly severity: "error";
  readonly category: "form-contract";
  readonly message: string;
  readonly file: string;
  readonly range: SourceRange;
  readonly facts: FormControlCodecMismatchFacts;
  readonly related: readonly RelatedLocation[];
  readonly repair: RepairInstruction;
}

export interface FormControlUnsupportedFacts {
  readonly actionId: string;
  readonly controlKind: "button" | "input";
  readonly controlType: string;
  readonly fieldName: string;
  readonly formId: string;
  readonly reason: "file-input" | "named-submitter" | "submitter-route-override";
  readonly template: string;
}

export interface FormControlUnsupportedDiagnostic {
  readonly code: "form.control_unsupported";
  readonly severity: "error";
  readonly category: "form-contract";
  readonly message: string;
  readonly file: string;
  readonly range: SourceRange;
  readonly facts: FormControlUnsupportedFacts;
  readonly related: readonly RelatedLocation[];
  readonly repair: RepairInstruction;
}

export interface HandlerExportMissingFacts {
  readonly actionId: string;
  readonly exportName: string;
  readonly handlerFile: string;
}

export interface HandlerExportMissingDiagnostic {
  readonly code: "handler.export_missing";
  readonly severity: "error";
  readonly category: "project-structure";
  readonly message: string;
  readonly file: string;
  readonly range: SourceRange;
  readonly facts: HandlerExportMissingFacts;
  readonly related: readonly RelatedLocation[];
  readonly repair: RepairInstruction;
}

export interface RouteMissingFacts {
  readonly actionId: string;
  readonly expectedMethod: "POST";
  readonly expectedPath: string;
  readonly routeIndex: string;
  readonly sameMethodPaths: readonly string[];
}

export interface RouteMissingDiagnostic {
  readonly code: "route.missing";
  readonly severity: "error";
  readonly category: "route-contract";
  readonly message: string;
  readonly file: string;
  readonly range: SourceRange;
  readonly facts: RouteMissingFacts;
  readonly related: readonly RelatedLocation[];
  readonly repair: RepairInstruction;
}

export interface ModuleBoundaryViolationFacts {
  readonly boundaryId: string;
  readonly edgeKind: "runtime" | "type";
  readonly importChain: readonly string[];
  readonly importSpecifier: string;
  readonly mode: "direct" | "transitive";
  readonly sourceRole: string;
  readonly targetFile: string;
  readonly targetRole: string;
}

export interface ModuleBoundaryViolationDiagnostic {
  readonly code: "module.boundary_violation";
  readonly severity: "error";
  readonly category: "environment-boundary";
  readonly message: string;
  readonly file: string;
  readonly range: SourceRange;
  readonly facts: ModuleBoundaryViolationFacts;
  readonly related: readonly RelatedLocation[];
  readonly repair: RepairInstruction;
}

export interface ModuleDynamicImportUnsupportedFacts {
  readonly boundaryId: string;
  readonly mode: "direct" | "transitive";
  readonly sourceRole: string;
}

export interface ModuleDynamicImportUnsupportedDiagnostic {
  readonly code: "module.dynamic_import_unsupported";
  readonly severity: "error";
  readonly category: "environment-boundary";
  readonly message: string;
  readonly file: string;
  readonly range: SourceRange;
  readonly facts: ModuleDynamicImportUnsupportedFacts;
  readonly related: readonly RelatedLocation[];
  readonly repair: RepairInstruction;
}

export interface FileOwnershipMismatchFacts {
  readonly actualPath: string;
  readonly expectedWithinFeature: string;
  readonly featureId: string | null;
  readonly kind: "i18n" | "test";
  readonly ruleId: string;
}

export interface FileOwnershipMismatchDiagnostic {
  readonly code: "file.ownership_mismatch";
  readonly severity: "error";
  readonly category: "project-structure";
  readonly message: string;
  readonly file: string;
  readonly range: SourceRange;
  readonly facts: FileOwnershipMismatchFacts;
  readonly related: readonly RelatedLocation[];
  readonly repair: RepairInstruction;
}

export interface FileRoleMismatchFacts {
  readonly actionId: string;
  readonly actualRole: string;
  readonly expectedRole: string;
  readonly expectedWithinFeature: string;
  readonly featureId: string;
  readonly handlerFile: string;
}

export interface FileRoleMismatchDiagnostic {
  readonly code: "file.role_mismatch";
  readonly severity: "error";
  readonly category: "project-structure";
  readonly message: string;
  readonly file: string;
  readonly range: SourceRange;
  readonly facts: FileRoleMismatchFacts;
  readonly related: readonly RelatedLocation[];
  readonly repair: RepairInstruction;
}

export type Diagnostic =
  | FileOwnershipMismatchDiagnostic
  | FileRoleMismatchDiagnostic
  | FormActionMismatchDiagnostic
  | FormControlCodecMismatchDiagnostic
  | FormControlUnsupportedDiagnostic
  | FormFieldMissingDiagnostic
  | FormFieldUnexpectedDiagnostic
  | FormMethodMismatchDiagnostic
  | HandlerExportMissingDiagnostic
  | RouteMissingDiagnostic
  | ModuleBoundaryViolationDiagnostic
  | ModuleDynamicImportUnsupportedDiagnostic;

export interface DiagnosticReport {
  readonly schemaVersion: 1;
  readonly producer: {
    readonly name: "mensor";
    readonly version: string;
  };
  readonly status: "passed" | "failed";
  readonly diagnostics: readonly Diagnostic[];
  readonly summary: {
    readonly errorCount: number;
    readonly warningCount: number;
  };
}

export type DiagnosticReportV1 = DiagnosticReport;

export type InspectionState = "checked" | "not-configured" | "out-of-scope";

export type InspectionBasis =
  | "file-roles"
  | "form-index"
  | "static-html-form-index"
  | "static-module-facts"
  | "module-graph"
  | "ownership-rules"
  | "route-index"
  | "none";

export interface InspectionDomain<
  State extends InspectionState,
  Basis extends InspectionBasis,
> {
  readonly state: State;
  readonly basis: Basis;
}

export interface InspectionReport {
  readonly filePlacement: InspectionDomain<"checked", "file-roles">;
  readonly forms: InspectionDomain<
    "checked",
    "form-index" | "static-html-form-index"
  >;
  readonly handlers: InspectionDomain<"checked", "static-module-facts">;
  readonly moduleBoundaries: InspectionDomain<
    "checked" | "not-configured",
    "module-graph"
  >;
  readonly ownership: InspectionDomain<
    "checked" | "not-configured",
    "ownership-rules"
  >;
  readonly routes: InspectionDomain<"checked" | "not-configured", "route-index">;
  readonly runtimeSemantics: InspectionDomain<"out-of-scope", "none">;
}

export interface DiagnosticReportV2 {
  readonly schemaVersion: 2;
  readonly producer: {
    readonly name: "mensor";
    readonly version: string;
  };
  readonly status: "passed" | "failed";
  readonly inspection: InspectionReport;
  readonly diagnostics: readonly Diagnostic[];
  readonly summary: {
    readonly errorCount: number;
    readonly warningCount: number;
  };
}

export interface CheckFailure {
  readonly kind: "configuration" | "filesystem" | "internal";
  readonly code: string;
  readonly message: string;
  readonly file?: string;
  readonly issues?: readonly ContractIssue[];
}

export interface CheckFailureEnvelopeV2 {
  readonly schemaVersion: 2;
  readonly producer: {
    readonly name: "mensor";
    readonly version: string;
  };
  readonly status: "error";
  readonly failure: CheckFailure;
}

export type CheckOutputV2 = DiagnosticReportV2 | CheckFailureEnvelopeV2;
