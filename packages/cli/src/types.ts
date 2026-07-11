import type { CompilerFailure } from "@mensor/compiler";

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

export interface RunCliOptions extends CliIo {
  readonly argv: readonly string[];
  readonly cwd: string;
}

export interface CliFailureEnvelope {
  readonly schemaVersion: 1;
  readonly producer: {
    readonly name: "mensor";
    readonly version: string;
  };
  readonly status: "error";
  readonly failure: CompilerFailure;
}
