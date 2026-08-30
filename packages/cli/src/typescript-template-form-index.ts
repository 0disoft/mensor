import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import * as path from "node:path";

import { extractStaticHtmlFormDocument } from "@0disoft/mensor-compiler";
import {
  serializeFormIndex,
  type FormIndex,
  type FormIndexControl,
  type FormIndexEvidence,
  type FormIndexForm,
  type SourcePosition,
  type SourceRange,
} from "@0disoft/mensor-contract";
import ts from "@typescript/typescript6";

const maxSourceBytes = 1_048_576;
const identifierPattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;

export class TypeScriptTemplateFormIndexError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly file?: string,
  ) {
    super(message);
    this.name = "TypeScriptTemplateFormIndexError";
  }
}

export interface ProduceTypeScriptTemplateFormIndexOptions {
  readonly root: string;
  readonly sources: readonly string[];
  readonly tags: readonly string[];
  readonly producerVersion: string;
}

export interface ProducedTypeScriptTemplateFormIndex {
  readonly value: FormIndex;
  readonly text: string;
}

export async function produceTypeScriptTemplateFormIndex(
  options: ProduceTypeScriptTemplateFormIndexOptions,
): Promise<ProducedTypeScriptTemplateFormIndex> {
  if (options.sources.length === 0) {
    throw new TypeScriptTemplateFormIndexError(
      "form_indexer.source_required",
      "At least one root-relative TypeScript template source is required.",
    );
  }
  if (options.tags.length === 0) {
    throw new TypeScriptTemplateFormIndexError(
      "form_indexer.tag_required",
      "At least one tagged-template identifier is required.",
    );
  }
  const tags = new Set<string>();
  for (const tag of options.tags) {
    if (!identifierPattern.test(tag)) {
      throw new TypeScriptTemplateFormIndexError(
        "form_indexer.tag_invalid",
        `Template tag ${JSON.stringify(tag)} must be a JavaScript identifier.`,
      );
    }
    tags.add(tag);
  }

  const root = await realpath(options.root).catch(() => {
    throw new TypeScriptTemplateFormIndexError(
      "form_indexer.root_invalid",
      "The selected project root could not be resolved.",
    );
  });
  const documents: FormIndex["documents"][number][] = [];
  for (const sourcePath of [...new Set(options.sources.map(normalizeSourcePath))].sort(compareText)) {
    const source = await readSource(root, sourcePath);
    const extracted = extractDocument(sourcePath, source.text, source.digest, tags);
    if (extracted.templateCount === 0) {
      throw new TypeScriptTemplateFormIndexError(
        "form_indexer.no_templates",
        "No selected tagged template was found in the explicit source file.",
        sourcePath,
      );
    }
    documents.push(extracted.document);
  }

  const value: FormIndex = {
    schemaVersion: 1,
    producer: {
      name: "mensor-typescript-template-form-indexer",
      version: options.producerVersion,
    },
    documents,
  };
  try {
    return { value, text: serializeFormIndex(value) };
  } catch (error) {
    throw new TypeScriptTemplateFormIndexError(
      "form_indexer.output_invalid",
      error instanceof Error ? error.message : "The produced FormIndex is invalid.",
    );
  }
}

function extractDocument(
  file: string,
  sourceText: string,
  digest: `sha256:${string}`,
  tags: ReadonlySet<string>,
): {
  readonly document: FormIndex["documents"][number];
  readonly templateCount: number;
} {
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.ES2022,
    true,
    scriptKind(file),
  );
  const diagnostics = sourceFileSyntaxDiagnostics(sourceFile, sourceText, file)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (diagnostics.length > 0) {
    throw new TypeScriptTemplateFormIndexError(
      "form_indexer.source_syntax_invalid",
      "TypeScript template source contains syntax errors and cannot be indexed.",
      file,
    );
  }

  const forms: FormIndexForm[] = [];
  const dynamicRanges: SourceRange[] = [];
  let templateCount = 0;
  const nodes: ts.Node[] = [sourceFile];
  while (nodes.length > 0) {
    const node = nodes.pop();
    if (node === undefined) continue;
    if (
      ts.isTaggedTemplateExpression(node)
      && ts.isIdentifier(node.tag)
      && tags.has(node.tag.text)
    ) {
      templateCount += 1;
      const template = node.template;
      if (!ts.isNoSubstitutionTemplateLiteral(template)) {
        dynamicRanges.push(nodeRange(template, sourceFile));
      } else {
        const contentStart = template.getStart(sourceFile) + 1;
        const contentEnd = template.getEnd() - 1;
        const html = sourceText.slice(contentStart, contentEnd);
        const base = sourceFile.getLineAndCharacterOfPosition(contentStart);
        const extracted = extractStaticHtmlFormDocument(file, html);
        forms.push(...extracted.forms.map((form) => offsetForm(form, base)));
      }
    }
    node.forEachChild((child) => {
      nodes.push(child);
    });
  }
  forms.sort((left, right) => compareRange(left.range, right.range));
  dynamicRanges.sort(compareRange);
  const dynamicRange = dynamicRanges[0];
  return {
    templateCount,
    document: {
      path: file,
      contentDigest: digest,
      sourceKind: "mensor/typescript-tagged-html",
      inspection: dynamicRange === undefined
        ? { state: "complete" }
        : {
            state: "incomplete",
            reason: "dynamic-interpolation",
            range: dynamicRange,
          },
      forms,
    },
  };
}

function offsetForm(form: FormIndexForm, base: SourcePosition): FormIndexForm {
  return {
    identity: offsetEvidence(form.identity, base),
    method: offsetEvidence(form.method, base),
    action: form.action.state === "current-document"
      ? { state: "current-document", range: offsetRange(form.action.range, base) }
      : offsetEvidence(form.action, base),
    range: offsetRange(form.range, base),
    controls: form.controls.map((control) => offsetControl(control, base)),
  };
}

function offsetControl(
  control: FormIndexControl,
  base: SourcePosition,
): FormIndexControl {
  return {
    name: offsetEvidence(control.name, base),
    controlKind: offsetEvidence(control.controlKind, base),
    inputType: offsetEvidence(control.inputType, base),
    multiple: offsetEvidence(control.multiple, base),
    multiplicity: offsetEvidence(control.multiplicity, base),
    successful: offsetEvidence(control.successful, base),
    range: offsetRange(control.range, base),
  };
}

function offsetEvidence<T>(
  evidence: FormIndexEvidence<T>,
  base: SourcePosition,
): FormIndexEvidence<T> {
  if (evidence.state === "absent") {
    return evidence.range === undefined
      ? { state: "absent" }
      : { state: "absent", range: offsetRange(evidence.range, base) };
  }
  if (evidence.state === "known") {
    return {
      state: "known",
      value: evidence.value,
      range: offsetRange(evidence.range, base),
    };
  }
  return evidence.state === "dynamic"
    ? {
        state: "dynamic",
        reason: evidence.reason,
        range: offsetRange(evidence.range, base),
      }
    : {
        state: "unsupported",
        reason: evidence.reason,
        range: offsetRange(evidence.range, base),
      };
}

function offsetRange(range: SourceRange, base: SourcePosition): SourceRange {
  return {
    start: offsetPosition(range.start, base),
    end: offsetPosition(range.end, base),
  };
}

function offsetPosition(
  position: SourcePosition,
  base: SourcePosition,
): SourcePosition {
  return {
    line: base.line + position.line,
    character: position.line === 0
      ? base.character + position.character
      : position.character,
  };
}

function nodeRange(node: ts.Node, sourceFile: ts.SourceFile): SourceRange {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    start: { line: start.line, character: start.character },
    end: { line: end.line, character: end.character },
  };
}

async function readSource(
  root: string,
  relativePath: string,
): Promise<{ readonly text: string; readonly digest: `sha256:${string}` }> {
  const absolutePath = path.resolve(root, relativePath);
  if (!isWithin(root, absolutePath)) {
    throw new TypeScriptTemplateFormIndexError(
      "form_indexer.source_outside_root",
      "Template source resolves outside the selected project root.",
      relativePath,
    );
  }
  await rejectSymbolicLinkComponents(root, absolutePath, relativePath);
  let handle: FileHandle | undefined;
  try {
    handle = await open(absolutePath, "r");
    const before = await handle.stat();
    if (!before.isFile()) {
      throw sourceFailure("form_indexer.source_not_file", "Template source must be a regular file.", relativePath);
    }
    if (before.size > maxSourceBytes) {
      throw sourceFailure("form_indexer.source_too_large", `Template source exceeds ${maxSourceBytes} bytes.`, relativePath);
    }
    const bytes = Buffer.alloc(before.size + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const after = await handle.stat();
    if (bytesRead > maxSourceBytes || !sameFile(before, after)) {
      throw sourceFailure("form_indexer.source_changed", "Template source changed while it was read.", relativePath);
    }
    const sourceBytes = bytes.subarray(0, bytesRead);
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes);
    } catch {
      throw sourceFailure("form_indexer.source_encoding_invalid", "Template source must be valid UTF-8.", relativePath);
    }
    return {
      text,
      digest: `sha256:${createHash("sha256").update(sourceBytes).digest("hex")}`,
    };
  } catch (error) {
    if (error instanceof TypeScriptTemplateFormIndexError) throw error;
    throw sourceFailure("form_indexer.source_read_failed", "Template source could not be read.", relativePath);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function rejectSymbolicLinkComponents(
  root: string,
  absolutePath: string,
  relativePath: string,
): Promise<void> {
  const relative = path.relative(root, absolutePath);
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stats = await lstat(current).catch(() => undefined);
    if (stats === undefined) {
      throw sourceFailure("form_indexer.source_read_failed", "Template source could not be read.", relativePath);
    }
    if (stats.isSymbolicLink()) {
      throw sourceFailure("form_indexer.source_symlink", "Template source must not use symbolic-link components.", relativePath);
    }
  }
}

function normalizeSourcePath(value: string): string {
  if (
    value.length === 0
    || path.isAbsolute(value)
    || path.win32.isAbsolute(value)
    || value.includes("\\")
  ) {
    throw sourceFailure("form_indexer.source_path_invalid", "Template source must be a root-relative POSIX path.", value);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw sourceFailure("form_indexer.source_path_invalid", "Template source path is not canonical.", value);
  }
  return value;
}

function sourceFailure(code: string, message: string, file: string) {
  return new TypeScriptTemplateFormIndexError(code, message, file);
}

function sameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (
    relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

function scriptKind(fileName: string): ts.ScriptKind {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if ([".js", ".mjs", ".cjs"].includes(extension)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function sourceFileSyntaxDiagnostics(
  sourceFile: ts.SourceFile,
  sourceText: string,
  fileName: string,
): readonly ts.Diagnostic[] {
  const parserDiagnostics = (sourceFile as ts.SourceFile & {
    readonly parseDiagnostics?: readonly ts.Diagnostic[];
  }).parseDiagnostics;
  if (parserDiagnostics !== undefined) return parserDiagnostics;
  return ts.transpileModule(sourceText, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: { noEmit: true, target: ts.ScriptTarget.ES2022 },
  }).diagnostics ?? [];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareRange(left: SourceRange, right: SourceRange): number {
  return left.start.line - right.start.line
    || left.start.character - right.start.character
    || left.end.line - right.end.line
    || left.end.character - right.end.character;
}
