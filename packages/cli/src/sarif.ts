import type {
  Diagnostic,
  DiagnosticReport,
  DiagnosticReportV2,
  RelatedLocation,
  SourceRange,
} from "@0disoft/mensor-contract";

const sarifSchema = "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json";

export function formatDiagnosticReportSarif(
  report: DiagnosticReport | DiagnosticReportV2,
): string {
  const codes = [...new Set(report.diagnostics.map((diagnostic) => diagnostic.code))]
    .sort(compareText);
  const firstByCode = new Map<string, Diagnostic>();
  for (const diagnostic of report.diagnostics) {
    if (!firstByCode.has(diagnostic.code)) firstByCode.set(diagnostic.code, diagnostic);
  }
  const ruleIndexes = new Map(codes.map((code, index) => [code, index]));
  const rules = codes.map((code) => {
    const diagnostic = firstByCode.get(code);
    if (diagnostic === undefined) throw new Error(`Missing SARIF rule source for ${code}.`);
    return {
      id: code,
      shortDescription: { text: code },
      fullDescription: {
        text: `Mensor ${diagnostic.category} diagnostic ${code}.`,
      },
      help: { text: diagnostic.repair.hint },
      properties: {
        category: diagnostic.category,
        tags: [diagnostic.category],
      },
    };
  });
  const results = report.diagnostics.map((diagnostic) => ({
    ruleId: diagnostic.code,
    ruleIndex: requiredRuleIndex(ruleIndexes, diagnostic.code),
    level: diagnostic.severity,
    message: { text: diagnostic.message },
    locations: [physicalLocation(diagnostic.file, diagnostic.range)],
    ...(diagnostic.related.length === 0
      ? {}
      : {
          relatedLocations: diagnostic.related.map((related, index) =>
            sarifRelatedLocation(related, index + 1)),
        }),
    properties: {
      category: diagnostic.category,
      facts: diagnostic.facts,
      repair: diagnostic.repair,
    },
  }));
  return `${JSON.stringify({
    $schema: sarifSchema,
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "Mensor",
            semanticVersion: report.producer.version,
            informationUri: "https://github.com/0disoft/mensor",
            rules,
          },
        },
        results,
      },
    ],
  }, null, 2)}\n`;
}

function physicalLocation(file: string, range: SourceRange) {
  return {
    physicalLocation: {
      artifactLocation: { uri: file },
      region: sarifRegion(range),
    },
  };
}

function sarifRelatedLocation(related: RelatedLocation, id: number) {
  return {
    id,
    message: { text: related.message },
    physicalLocation: {
      artifactLocation: { uri: related.file },
      region: sarifRegion(related.range),
    },
    properties: { role: related.role },
  };
}

function sarifRegion(range: SourceRange) {
  return {
    startLine: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLine: range.end.line + 1,
    endColumn: range.end.character + 1,
  };
}

function requiredRuleIndex(indexes: ReadonlyMap<string, number>, code: string): number {
  const value = indexes.get(code);
  if (value === undefined) throw new Error(`Missing SARIF rule index for ${code}.`);
  return value;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
