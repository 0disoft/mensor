import { performance } from "node:perf_hooks";

export type CompilerPhase =
  | "discovery"
  | "formIndexValidation"
  | "ruleEvaluation"
  | "sourceRead"
  | "templateRead"
  | "typescriptExtraction"
  | "templateExtraction";

export interface CompilerPerformanceMetrics {
  readonly totalDurationMs: number;
  readonly phaseDurationMs: {
    readonly discovery: number;
    readonly sourceRead: number;
    readonly typescriptExtraction: number;
    readonly templateRead: number;
    readonly templateExtraction: number;
    readonly formIndexValidation: number;
    readonly ruleEvaluation: number;
    readonly other: number;
  };
  readonly templateDocumentCount: number;
  readonly templateBytes: number;
}

export class CompilerTiming {
  readonly #durations: Record<CompilerPhase, number> = {
    discovery: 0,
    formIndexValidation: 0,
    ruleEvaluation: 0,
    sourceRead: 0,
    templateRead: 0,
    templateExtraction: 0,
    typescriptExtraction: 0,
  };

  readonly #frames: Array<{ childDurationMs: number }> = [];

  #templateDocumentCount = 0;
  #templateBytes = 0;

  async measure<T>(
    phase: CompilerPhase,
    operation: () => Promise<T>,
  ): Promise<T> {
    const frame = { childDurationMs: 0 };
    const startedAt = performance.now();
    this.#frames.push(frame);
    try {
      return await operation();
    } finally {
      this.finishMeasurement(phase, startedAt, frame);
    }
  }

  measureSync<T>(phase: CompilerPhase, operation: () => T): T {
    const frame = { childDurationMs: 0 };
    const startedAt = performance.now();
    this.#frames.push(frame);
    try {
      return operation();
    } finally {
      this.finishMeasurement(phase, startedAt, frame);
    }
  }

  recordTemplateSource(source: string): void {
    this.#templateDocumentCount += 1;
    this.#templateBytes += Buffer.byteLength(source);
  }

  snapshot(totalDurationMs: number): CompilerPerformanceMetrics {
    const measuredDurationMs = Object.values(this.#durations).reduce(
      (total, duration) => total + duration,
      0,
    );
    return {
      totalDurationMs,
      phaseDurationMs: {
        discovery: this.#durations.discovery,
        sourceRead: this.#durations.sourceRead,
        typescriptExtraction: this.#durations.typescriptExtraction,
        templateRead: this.#durations.templateRead,
        templateExtraction: this.#durations.templateExtraction,
        formIndexValidation: this.#durations.formIndexValidation,
        ruleEvaluation: this.#durations.ruleEvaluation,
        other: Math.max(0, totalDurationMs - measuredDurationMs),
      },
      templateDocumentCount: this.#templateDocumentCount,
      templateBytes: this.#templateBytes,
    };
  }

  private finishMeasurement(
    phase: CompilerPhase,
    startedAt: number,
    frame: { childDurationMs: number },
  ): void {
    const elapsedMs = performance.now() - startedAt;
    const active = this.#frames.pop();
    if (active !== frame) {
      throw new Error("Compiler timing measurements must be nested serially.");
    }
    this.#durations[phase] += Math.max(0, elapsedMs - frame.childDurationMs);
    const parent = this.#frames.at(-1);
    if (parent !== undefined) {
      parent.childDurationMs += elapsedMs;
    }
  }
}
