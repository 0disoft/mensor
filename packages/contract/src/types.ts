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

export interface ObjectSchema {
  readonly kind: "object";
  readonly properties: Readonly<Record<string, StringSchema>>;
  readonly required: readonly string[];
}

export interface TextDecoder {
  readonly kind: "text";
  readonly trim: boolean;
  readonly empty: "allow" | "reject";
}

export interface FormBinding {
  readonly name: string;
  readonly path: readonly string[];
  readonly decode: TextDecoder;
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
  | FileRoleMismatchDiagnostic
  | FormFieldMissingDiagnostic;

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
