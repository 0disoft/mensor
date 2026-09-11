import type { CompilerFailure } from "@0disoft/mensor-compiler";

const enumSchema = "#/$defs/enumDecoder/";
const decoderPath = /^\/actions\/[0-9]+\/input\/formCodec\/bindings\/[0-9]+\/decode$/u;

export function humanFailureHints(failure: CompilerFailure): readonly string[] {
  if (failure.kind !== "configuration" || failure.code !== "contract.invalid") {
    return [];
  }

  const enumIssues = (failure.issues ?? []).filter((issue) =>
    issue.code === "schema.violation" && issue.schemaPath?.startsWith(enumSchema));
  const candidates = new Set(enumIssues.flatMap((issue) =>
    issue.keyword === "additionalProperties" &&
    issue.schemaPath === `${enumSchema}additionalProperties` &&
    issue.instancePath !== undefined && decoderPath.test(issue.instancePath)
      ? [issue.instancePath]
      : []));

  // oneOf reports every decoder candidate; only an otherwise-valid enum is actionable.
  return [...candidates].sort().filter((candidate) => !enumIssues.some((issue) =>
    (issue.instancePath === candidate || issue.instancePath?.startsWith(`${candidate}/`)) &&
    !(issue.instancePath === candidate && issue.keyword === "additionalProperties" &&
      issue.schemaPath === `${enumSchema}additionalProperties`)))
    .slice(0, 3)
    .map((candidate) =>
      `${candidate}: enum decoders accept only "kind" and "values"; ` +
      `"trim" and "empty" are text-decoder options.`);
}
