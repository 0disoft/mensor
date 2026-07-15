import { InputFailure } from "./paths.js";
import { extractModuleFact, type ModuleFact } from "./typescript-source.js";

export interface SourceFactIndex {
  readonly get: (file: string) => Promise<ModuleFact>;
}

export function createSourceFactIndex(
  readSource: (file: string) => Promise<string>,
): SourceFactIndex {
  const facts = new Map<string, Promise<ModuleFact>>();
  return {
    get(file) {
      let fact = facts.get(file);
      if (fact === undefined) {
        fact = readAndParseSource(readSource, file);
        facts.set(file, fact);
      }
      return fact;
    },
  };
}

async function readAndParseSource(
  readSource: (file: string) => Promise<string>,
  file: string,
): Promise<ModuleFact> {
  const sourceText = await readSource(file);
  const fact = extractModuleFact(sourceText, file);
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
