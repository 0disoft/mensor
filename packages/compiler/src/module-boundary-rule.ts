import * as path from "node:path";

import type {
  BoundaryContract,
  Diagnostic,
  FileRoleContract,
  ModuleBoundaryViolationDiagnostic,
  ModuleDynamicImportUnsupportedDiagnostic,
  SourceRange,
} from "@mensor/contract";

import { readProjectFile } from "./filesystem.js";
import { findFeatureOwner, sortFeatureRoots } from "./feature-roots.js";
import { projectBoundaryRange } from "./locations.js";
import { compareText, InputFailure } from "./paths.js";
import { extractModuleFact, type ModuleFact } from "./typescript-source.js";

interface ProjectModuleFact {
  readonly file: string;
  readonly role: string;
  readonly fact: ModuleFact;
  readonly edges: readonly ResolvedModuleEdge[];
}

interface ResolvedModuleEdge {
  readonly edgeKind: "runtime" | "type";
  readonly specifier: string;
  readonly range: SourceRange;
  readonly target: string;
}

const sourceExtensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

export async function checkImportBoundaries(options: {
  readonly root: string;
  readonly projectContractPath: string;
  readonly projectText: string;
  readonly featureContractPaths: readonly string[];
  readonly fileRoles: readonly FileRoleContract[];
  readonly boundaries: readonly BoundaryContract[];
  readonly discoveredFiles: readonly string[];
  readonly maxFileBytes: number;
}): Promise<readonly Diagnostic[]> {
  if (options.boundaries.length === 0) {
    return [];
  }
  validateBoundaries(options.boundaries, options.fileRoles);
  const sourceFiles = options.discoveredFiles
    .filter(isSourceFile)
    .sort(compareText);
  const discovered = new Set(sourceFiles);
  const featureRoots = sortFeatureRoots(
    options.featureContractPaths.map((contract) => ({
      root: path.posix.dirname(contract),
    })),
  );
  const parsed = new Map<string, ModuleFact>();
  for (const file of sourceFiles) {
    const sourceText = await readProjectFile(options.root, file, options.maxFileBytes);
    const fact = extractModuleFact(sourceText, file);
    if (fact.syntaxErrors.length > 0) {
      throw new InputFailure(
        "configuration",
        "typescript.syntax_invalid",
        `Source ${JSON.stringify(file)} contains unsupported syntax: ${fact.syntaxErrors[0]}`,
        file,
      );
    }
    parsed.set(file, fact);
  }

  const modules = new Map<string, ProjectModuleFact>();
  for (const file of sourceFiles) {
    const fact = parsed.get(file);
    if (fact === undefined) {
      continue;
    }
    const edges = fact.imports.flatMap((entry) => {
      const target = resolveImport(file, entry.specifier, discovered);
      if (target === undefined) {
        return [];
      }
      return [{
        edgeKind: entry.edgeKind,
        specifier: entry.specifier,
        range: entry.range,
        target,
      }];
    });
    modules.set(file, {
      file,
      role: classifyProjectRole(file, featureRoots, options.fileRoles),
      fact,
      edges: [...edges].sort(compareEdges),
    });
  }

  const diagnostics: Diagnostic[] = [];
  options.boundaries.forEach((boundary, boundaryIndex) => {
    const roots = [...modules.values()]
      .filter((module) => boundary.from.includes(module.role))
      .sort((left, right) => compareText(left.file, right.file));
    for (const root of roots) {
      if (boundary.mode === "direct") {
        diagnostics.push(
          ...checkDirectBoundary(
            root,
            boundary,
            boundaryIndex,
            modules,
            options,
          ),
        );
      } else {
        diagnostics.push(
          ...checkTransitiveBoundary(
            root,
            boundary,
            boundaryIndex,
            modules,
            options,
          ),
        );
      }
    }
  });
  return diagnostics;
}

function checkDirectBoundary(
  root: ProjectModuleFact,
  boundary: BoundaryContract,
  boundaryIndex: number,
  modules: ReadonlyMap<string, ProjectModuleFact>,
  options: {
    readonly projectContractPath: string;
    readonly projectText: string;
  },
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = root.fact.unsupportedDynamicImports.map((range) =>
    dynamicImportDiagnostic(root, range, boundary, boundaryIndex, options),
  );
  for (const edge of root.edges) {
    const target = modules.get(edge.target);
    if (target !== undefined && boundary.deny.includes(target.role)) {
      diagnostics.push(
        boundaryViolationDiagnostic(
          root,
          edge,
          target,
          [root.file, target.file],
          boundary,
          boundaryIndex,
          options,
        ),
      );
    }
  }
  return diagnostics;
}

function checkTransitiveBoundary(
  root: ProjectModuleFact,
  boundary: BoundaryContract,
  boundaryIndex: number,
  modules: ReadonlyMap<string, ProjectModuleFact>,
  options: {
    readonly projectContractPath: string;
    readonly projectText: string;
  },
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const queue: Array<{ readonly module: ProjectModuleFact; readonly chain: readonly string[] }> = [
    { module: root, chain: [root.file] },
  ];
  const visited = new Set<string>();
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current === undefined || visited.has(current.module.file)) {
      continue;
    }
    visited.add(current.module.file);
    diagnostics.push(
      ...current.module.fact.unsupportedDynamicImports.map((range) =>
        dynamicImportDiagnostic(current.module, range, boundary, boundaryIndex, options),
      ),
    );
    for (const edge of current.module.edges) {
      const target = modules.get(edge.target);
      if (target === undefined) {
        continue;
      }
      const chain = [...current.chain, target.file];
      if (boundary.deny.includes(target.role)) {
        diagnostics.push(
          boundaryViolationDiagnostic(
            root,
            edge,
            target,
            chain,
            boundary,
            boundaryIndex,
            options,
          ),
        );
      } else if (!visited.has(target.file)) {
        queue.push({ module: target, chain });
      }
    }
  }
  return diagnostics;
}

function boundaryViolationDiagnostic(
  root: ProjectModuleFact,
  edge: ResolvedModuleEdge,
  target: ProjectModuleFact,
  importChain: readonly string[],
  boundary: BoundaryContract,
  boundaryIndex: number,
  options: {
    readonly projectContractPath: string;
    readonly projectText: string;
  },
): ModuleBoundaryViolationDiagnostic {
  return {
    code: "module.boundary_violation",
    severity: "error",
    category: "environment-boundary",
    message: `Boundary ${JSON.stringify(boundary.id)} forbids ${JSON.stringify(root.role)} code from reaching ${JSON.stringify(target.role)} module ${JSON.stringify(target.file)}.`,
    file: importChain[importChain.length - 2] ?? root.file,
    range: edge.range,
    facts: {
      boundaryId: boundary.id,
      edgeKind: edge.edgeKind,
      importChain,
      importSpecifier: edge.specifier,
      mode: boundary.mode,
      sourceRole: root.role,
      targetFile: target.file,
      targetRole: target.role,
    },
    related: [
      {
        role: "forbidden-target",
        message: `This module is classified as ${target.role}.`,
        file: target.file,
        range: zeroRange(),
      },
      {
        role: "boundary-declaration",
        message: "This project contract declares the violated boundary.",
        file: options.projectContractPath,
        range: projectBoundaryRange(options.projectText, boundaryIndex),
      },
    ],
    repair: {
      strategy: "remove-forbidden-module-edge",
      hint: `Move shared contracts behind an allowed module and remove the dependency on ${target.file}.`,
      mustPreserve: [
        `boundary ${boundary.id}`,
        `${target.role} classification of ${target.file}`,
      ],
      mustNot: [
        "delete the boundary",
        `reclassify ${target.file} to hide the violation`,
      ],
    },
  };
}

function dynamicImportDiagnostic(
  source: ProjectModuleFact,
  range: SourceRange,
  boundary: BoundaryContract,
  boundaryIndex: number,
  options: {
    readonly projectContractPath: string;
    readonly projectText: string;
  },
): ModuleDynamicImportUnsupportedDiagnostic {
  return {
    code: "module.dynamic_import_unsupported",
    severity: "error",
    category: "environment-boundary",
    message: `Boundary ${JSON.stringify(boundary.id)} cannot analyze a non-literal dynamic import.`,
    file: source.file,
    range,
    facts: {
      boundaryId: boundary.id,
      mode: boundary.mode,
      sourceRole: source.role,
    },
    related: [
      {
        role: "boundary-declaration",
        message: "This project contract requires deterministic import analysis.",
        file: options.projectContractPath,
        range: projectBoundaryRange(options.projectText, boundaryIndex),
      },
    ],
    repair: {
      strategy: "make-dynamic-import-literal",
      hint: "Replace the computed dynamic import with explicit literal import targets.",
      mustPreserve: [`boundary ${boundary.id}`, "module loading behavior"],
      mustNot: ["disable the boundary", "hide the import behind runtime string construction"],
    },
  };
}

function validateBoundaries(
  boundaries: readonly BoundaryContract[],
  fileRoles: readonly FileRoleContract[],
): void {
  const roles = new Set(fileRoles.map((entry) => entry.role));
  const ids = new Set<string>();
  for (const boundary of boundaries) {
    if (ids.has(boundary.id)) {
      throw new InputFailure(
        "configuration",
        "boundaries.duplicate_id",
        `Boundary ${JSON.stringify(boundary.id)} is declared more than once.`,
      );
    }
    ids.add(boundary.id);
    for (const role of [...boundary.from, ...boundary.deny]) {
      if (!roles.has(role)) {
        throw new InputFailure(
          "configuration",
          "boundaries.role_unknown",
          `Boundary ${JSON.stringify(boundary.id)} references unknown role ${JSON.stringify(role)}.`,
        );
      }
    }
  }
}

function classifyProjectRole(
  file: string,
  featureRoots: readonly { readonly root: string }[],
  fileRoles: readonly FileRoleContract[],
): string {
  const feature = findFeatureOwner(file, featureRoots);
  if (feature === undefined) {
    return "unclassified";
  }
  const featureFile = file.slice(feature.root.length + 1);
  return fileRoles.find((entry) =>
    featureFile.startsWith(`${entry.withinFeature}/`),
  )?.role ?? "unclassified";
}

function resolveImport(
  sourceFile: string,
  specifier: string,
  discovered: ReadonlySet<string>,
): string | undefined {
  if (!specifier.startsWith(".")) {
    return undefined;
  }
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(sourceFile), specifier));
  if (base.startsWith("../") || path.posix.isAbsolute(base)) {
    throw new InputFailure(
      "configuration",
      "module.import_escapes_root",
      `Import ${JSON.stringify(specifier)} from ${JSON.stringify(sourceFile)} escapes the project source root.`,
      sourceFile,
    );
  }
  for (const candidate of importCandidates(base)) {
    if (discovered.has(candidate)) {
      return candidate;
    }
  }
  const extension = path.posix.extname(base);
  if (extension.length === 0 || sourceExtensions.includes(extension)) {
    throw new InputFailure(
      "configuration",
      "module.import_unresolved",
      `Import ${JSON.stringify(specifier)} from ${JSON.stringify(sourceFile)} did not resolve to a discovered source module.`,
      sourceFile,
    );
  }
  return undefined;
}

function importCandidates(base: string): readonly string[] {
  const extension = path.posix.extname(base);
  if ([".js", ".mjs", ".cjs"].includes(extension)) {
    const stem = base.slice(0, -extension.length);
    return [
      `${stem}.ts`,
      `${stem}.tsx`,
      `${stem}.mts`,
      `${stem}.cts`,
      base,
    ];
  }
  if (extension.length > 0) {
    return [base];
  }
  return [
    ...sourceExtensions.map((candidateExtension) => `${base}${candidateExtension}`),
    ...sourceExtensions.map((candidateExtension) => `${base}/index${candidateExtension}`),
  ];
}

function isSourceFile(file: string): boolean {
  return sourceExtensions.includes(path.posix.extname(file));
}

function compareEdges(left: ResolvedModuleEdge, right: ResolvedModuleEdge): number {
  return (
    compareText(left.target, right.target) ||
    compareText(left.specifier, right.specifier) ||
    compareText(left.edgeKind, right.edgeKind) ||
    left.range.start.line - right.range.start.line ||
    left.range.start.character - right.range.start.character
  );
}

function zeroRange(): SourceRange {
  return {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 },
  };
}
