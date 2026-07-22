import type {
  CheckFailure,
  DiagnosticReport,
  DiagnosticReportV2,
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
