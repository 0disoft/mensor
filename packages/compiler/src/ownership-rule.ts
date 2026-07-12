import type {
  Diagnostic,
  FileOwnershipMismatchDiagnostic,
  OwnershipRuleContract,
} from "@mensor/contract";

import { projectOwnershipRuleRange } from "./locations.js";
import { findFeatureOwner, sortFeatureRoots } from "./feature-roots.js";
import { assertRelativePosixPath, compareText, InputFailure } from "./paths.js";

export interface FeatureOwnerFact {
  readonly id: string;
  readonly root: string;
}

export function checkOwnershipRules(options: {
  readonly projectContractPath: string;
  readonly projectText: string;
  readonly features: readonly FeatureOwnerFact[];
  readonly rules: readonly OwnershipRuleContract[];
  readonly discoveredFiles: readonly string[];
}): readonly Diagnostic[] {
  validateRules(options.rules);
  const features = sortFeatureRoots(options.features);
  const diagnostics: FileOwnershipMismatchDiagnostic[] = [];
  options.rules.forEach((rule, ruleIndex) => {
    const expectedSlot = assertRelativePosixPath(
      rule.withinFeature,
      "ownershipRules.withinFeature",
    );
    for (const file of [...options.discoveredFiles].sort(compareText)) {
      if (!rule.suffixes.some((suffix) => file.endsWith(suffix))) {
        continue;
      }
      const feature = findFeatureOwner(file, features);
      if (feature === undefined) {
        diagnostics.push(
          ownershipDiagnostic({
            file,
            actualPath: file,
            featureId: null,
            rule,
            ruleIndex,
            projectContractPath: options.projectContractPath,
            projectText: options.projectText,
          }),
        );
        continue;
      }
      const featurePath = file.slice(feature.root.length + 1);
      if (featurePath.startsWith(`${expectedSlot}/`)) {
        continue;
      }
      diagnostics.push(
        ownershipDiagnostic({
          file,
          actualPath: featurePath,
          featureId: feature.id,
          rule,
          ruleIndex,
          projectContractPath: options.projectContractPath,
          projectText: options.projectText,
        }),
      );
    }
  });
  return diagnostics;
}

function ownershipDiagnostic(options: {
  readonly file: string;
  readonly actualPath: string;
  readonly featureId: string | null;
  readonly rule: OwnershipRuleContract;
  readonly ruleIndex: number;
  readonly projectContractPath: string;
  readonly projectText: string;
}): FileOwnershipMismatchDiagnostic {
  const owner = options.featureId === null
    ? "outside every declared feature"
    : `outside feature slot ${JSON.stringify(options.rule.withinFeature)}`;
  return {
    code: "file.ownership_mismatch",
    severity: "error",
    category: "project-structure",
    message: `${options.rule.kind} file ${JSON.stringify(options.file)} is ${owner}.`,
    file: options.file,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    },
    facts: {
      actualPath: options.actualPath,
      expectedWithinFeature: options.rule.withinFeature,
      featureId: options.featureId,
      kind: options.rule.kind,
      ruleId: options.rule.id,
    },
    related: [
      {
        role: "ownership-rule",
        message: "This project contract declares the required feature slot.",
        file: options.projectContractPath,
        range: projectOwnershipRuleRange(options.projectText, options.ruleIndex),
      },
    ],
    repair: {
      strategy: "move-file-to-feature-owner",
      hint: options.featureId === null
        ? `Move the file under its owning feature's ${options.rule.withinFeature} directory.`
        : `Move the file to ${options.rule.withinFeature} inside feature ${options.featureId}.`,
      mustPreserve: [
        `${options.rule.kind} file behavior`,
        `ownership rule ${options.rule.id}`,
      ],
      mustNot: [
        "delete the ownership rule",
        "rename the file only to evade suffix detection",
      ],
    },
  };
}

function validateRules(rules: readonly OwnershipRuleContract[]): void {
  const ids = new Set<string>();
  for (const rule of rules) {
    if (ids.has(rule.id)) {
      throw new InputFailure(
        "configuration",
        "ownership_rules.duplicate_id",
        `Ownership rule ${JSON.stringify(rule.id)} is declared more than once.`,
      );
    }
    ids.add(rule.id);
  }
}
