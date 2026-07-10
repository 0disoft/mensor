import type { ContractIssue, DiagnosticReport } from "@mensor/contract";

export interface CheckProjectOptions {
  readonly root: string;
  readonly configFile?: string;
  readonly producerVersion?: string;
  readonly limits?: {
    readonly maxFiles?: number;
  };
}

export interface CheckProjectSuccess {
  readonly ok: true;
  readonly report: DiagnosticReport;
}

export interface CompilerFailure {
  readonly kind: "configuration" | "filesystem" | "internal";
  readonly code: string;
  readonly message: string;
  readonly file?: string;
  readonly issues?: readonly ContractIssue[];
}

export interface CheckProjectFailure {
  readonly ok: false;
  readonly failure: CompilerFailure;
}

export type CheckProjectResult = CheckProjectSuccess | CheckProjectFailure;
