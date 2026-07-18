import type { CompilerTiming } from "./compiler-timing.js";
import { InputFailure } from "./paths.js";
import { extractModuleFact, type ModuleFact } from "./typescript-source.js";

export interface SourceFactIndex {
  readonly get: (file: string) => Promise<ModuleFact>;
  readonly source: (file: string) => Promise<string>;
}

export function createSourceFactIndex(
  readSource: (file: string) => Promise<string>,
  timing?: CompilerTiming,
): SourceFactIndex {
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
