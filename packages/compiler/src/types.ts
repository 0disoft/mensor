import type {
  CheckFailure,
  DiagnosticReport,
  DiagnosticReportV2,
  RuntimeManifest,
} from "@0disoft/mensor-contract";

export interface CheckProjectBaseOptions {
  readonly root: string;
  readonly configFile?: string;
  readonly producerVersion?: string;
  readonly limits?: {
    readonly maxFiles?: number;
    readonly maxFileBytes?: number;
    readonly maxTotalBytes?: number;
    readonly maxDepth?: number;
  };
}

export interface CheckProjectOptions extends CheckProjectBaseOptions {
  readonly reportVersion?: 1;
}

export interface CheckProjectV2Options extends CheckProjectBaseOptions {
  readonly reportVersion: 2;
}

export interface CheckProjectSuccess {
  readonly ok: true;
  readonly report: DiagnosticReport;
}

export interface CheckProjectV2Success {
  readonly ok: true;
  readonly report: DiagnosticReportV2;
}

export interface CompilerFailure extends CheckFailure {}

export interface CheckProjectFailure {
  readonly ok: false;
  readonly failure: CompilerFailure;
}

export type CheckProjectResult = CheckProjectSuccess | CheckProjectFailure;

export type CheckProjectV2Result = CheckProjectV2Success | CheckProjectFailure;

export interface CompileProjectOptions extends CheckProjectBaseOptions {}

export interface CompileProjectSuccess {
  readonly ok: true;
  readonly report: DiagnosticReport;
  readonly manifest: RuntimeManifest;
}

export interface CompileProjectDiagnostics {
  readonly ok: false;
  readonly kind: "diagnostics";
  readonly report: DiagnosticReport;
}

export interface CompileProjectFailure {
  readonly ok: false;
  readonly kind: "failure";
  readonly failure: CompilerFailure;
}

export type CompileProjectResult =
  | CompileProjectSuccess
  | CompileProjectDiagnostics
  | CompileProjectFailure;

export interface DraftProjectContractsOptions {
  readonly root: string;
  readonly sourceRoot?: string;
  readonly configFile?: string;
  readonly featureRoot: string;
  readonly featureId: string;
  readonly handlerRole: string;
  readonly actionId?: string;
  readonly documentPath?: string;
  readonly form?: {
    readonly file: string;
    readonly id: string;
  };
  readonly handler?: {
    readonly file: string;
    readonly export: string;
  };
}

export interface DraftContractFile {
  readonly path: string;
  readonly content: string;
}

export interface DraftProjectContractsSuccess {
  readonly ok: true;
  readonly project: DraftContractFile;
  readonly feature: DraftContractFile;
  readonly selection: {
    readonly actionId: string;
    readonly form: {
      readonly file: string;
      readonly id: string;
    };
    readonly handler: {
      readonly file: string;
      readonly export: string;
    };
  };
}

export interface DraftProjectContractsFailure {
  readonly ok: false;
  readonly failure: CompilerFailure;
}

export type DraftProjectContractsResult =
  | DraftProjectContractsSuccess
  | DraftProjectContractsFailure;
