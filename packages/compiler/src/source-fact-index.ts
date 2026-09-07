import type { CompilerTiming } from "./compiler-timing.js";
import { InputFailure } from "./paths.js";
import { extractModuleFact, type ModuleFact } from "./typescript-source.js";

export interface SourceFactIndex {
  readonly get: (file: string) => Promise<ModuleFact>;
  readonly source: (file: string) => Promise<string>;
  readonly prefetch?: (files: readonly string[]) => Promise<void>;
}

export function createSourceFactIndex(
  readSource: (file: string) => Promise<string>,
  timing?: CompilerTiming,
  readConcurrency = 8,
): SourceFactIndex {
  if (!Number.isInteger(readConcurrency) || readConcurrency < 1 || readConcurrency > 8) {
    throw new TypeError("Source read concurrency must be between 1 and 8.");
  }
  const sources = new Map<string, Promise<string>>();
  const facts = new Map<string, Promise<ModuleFact>>();
  const source = (file: string): Promise<string> => {
    let value = sources.get(file);
    if (value === undefined) {
      value = timing === undefined
        ? readSource(file)
        : timing.measure("sourceRead", () => readSource(file));
      sources.set(file, value);
    }
    return value;
  };
  return {
    async prefetch(files) {
      if (readConcurrency === 1) return;
      const missing = [...new Set(files)].filter((file) => !sources.has(file));
      if (missing.length === 0) return;
      const read = async (): Promise<void> => {
        for (let start = 0; start < missing.length; start += readConcurrency) {
          const batch = missing.slice(start, start + readConcurrency).map((file) => {
            const pending = Promise.resolve().then(() => readSource(file));
            sources.set(file, pending);
            return pending;
          });
          // Drain every read; surface failures only when ordered traversal reaches them.
          await Promise.allSettled(batch);
        }
      };
      if (timing === undefined) await read();
      else await timing.measure("sourceRead", read);
    },
    get(file) {
      let fact = facts.get(file);
      if (fact === undefined) {
        fact = readAndParseSource(source, file, timing);
        facts.set(file, fact);
      }
      return fact;
    },
    source,
  };
}

async function readAndParseSource(
  sourceForFile: (file: string) => Promise<string>,
  file: string,
  timing?: CompilerTiming,
): Promise<ModuleFact> {
  const sourceText = await sourceForFile(file);
  const fact = timing === undefined
    ? extractModuleFact(sourceText, file)
    : timing.measureSync(
        "typescriptExtraction",
        () => extractModuleFact(sourceText, file),
      );
  if (fact.syntaxErrors.length > 0) {
    throw new InputFailure(
      "configuration",
      "typescript.syntax_invalid",
      `Source ${JSON.stringify(file)} contains unsupported syntax: ${fact.syntaxErrors[0]}`,
      file,
    );
  }
  return fact;
}
