import type { CompilerTiming } from "./compiler-timing.js";
import { InputFailure } from "./paths.js";
import { extractModuleFact, type ModuleFact } from "./typescript-source.js";

export interface SourceFactIndex {
  readonly get: (file: string) => Promise<ModuleFact>;
}

export function createSourceFactIndex(
  readSource: (file: string) => Promise<string>,
  timing?: CompilerTiming,
): SourceFactIndex {
  const facts = new Map<string, Promise<ModuleFact>>();
  return {
    get(file) {
      let fact = facts.get(file);
      if (fact === undefined) {
        fact = readAndParseSource(readSource, file, timing);
        facts.set(file, fact);
      }
      return fact;
    },
  };
}

async function readAndParseSource(
  readSource: (file: string) => Promise<string>,
  file: string,
  timing?: CompilerTiming,
): Promise<ModuleFact> {
  const sourceText = timing === undefined
    ? await readSource(file)
    : await timing.measure("sourceRead", () => readSource(file));
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
