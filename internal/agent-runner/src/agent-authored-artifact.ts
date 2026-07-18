import {
  lstat,
  mkdir,
  readdir,
  writeFile,
} from "node:fs/promises";
import * as path from "node:path";

export interface AgentAuthoredProjectArtifactFile {
  readonly path: string;
  readonly content: string;
}

export interface AgentAuthoredProjectArtifact {
  readonly schemaVersion: 1;
  readonly kind: "agent-authored-project-artifact";
  readonly files: readonly AgentAuthoredProjectArtifactFile[];
}

export interface AgentAuthoredProjectArtifactLimits {
  readonly maxFiles: number;
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
}

export interface MaterializeAgentAuthoredProjectArtifactOptions {
  readonly limits?: Partial<AgentAuthoredProjectArtifactLimits>;
}

const defaultLimits: AgentAuthoredProjectArtifactLimits = Object.freeze({
  maxFiles: 64,
  maxFileBytes: 262_144,
  maxTotalBytes: 1_048_576,
});

export function parseAgentAuthoredProjectArtifact(
  text: string,
  limits?: Partial<AgentAuthoredProjectArtifactLimits>,
): AgentAuthoredProjectArtifact {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Agent-authored project artifact must contain valid JSON.");
  }
  return validateAgentAuthoredProjectArtifact(value, limits);
}

export function validateAgentAuthoredProjectArtifact(
  value: unknown,
  limits?: Partial<AgentAuthoredProjectArtifactLimits>,
): AgentAuthoredProjectArtifact {
  const bounded = validateLimits(limits);
  const artifact = requireRecord(value, "artifact");
  requireExactKeys(artifact, ["schemaVersion", "kind", "files"], "artifact");
  if (
    artifact["schemaVersion"] !== 1
    || artifact["kind"] !== "agent-authored-project-artifact"
  ) {
    throw new Error("Unsupported agent-authored project artifact contract.");
  }
  if (!Array.isArray(artifact["files"])) {
    throw new Error("artifact.files must be an array.");
  }
  if (
    artifact["files"].length === 0
    || artifact["files"].length > bounded.maxFiles
  ) {
    throw new Error(`artifact.files must contain 1 to ${bounded.maxFiles} files.`);
  }

  let totalBytes = 0;
  const files = artifact["files"].map((value, index) => {
    const file = requireRecord(value, `artifact.files[${index}]`);
    requireExactKeys(file, ["path", "content"], `artifact.files[${index}]`);
    const filePath = requireProjectPath(file["path"], `artifact.files[${index}].path`);
    const content = requireFileContent(
      file["content"],
      bounded.maxFileBytes,
      `artifact.files[${index}].content`,
    );
    totalBytes += Buffer.byteLength(content, "utf8");
    if (totalBytes > bounded.maxTotalBytes) {
      throw new Error(
        `artifact file content exceeds ${bounded.maxTotalBytes} total bytes.`,
      );
    }
    return { path: filePath, content };
  }).sort((left, right) => compareText(left.path, right.path));

  validatePathSet(files.map((file) => file.path));
  return {
    schemaVersion: 1,
    kind: "agent-authored-project-artifact",
    files,
  };
}

export function serializeAgentAuthoredProjectArtifact(
  artifact: AgentAuthoredProjectArtifact,
  limits?: Partial<AgentAuthoredProjectArtifactLimits>,
): string {
  return `${JSON.stringify(
    validateAgentAuthoredProjectArtifact(artifact, limits),
    null,
    2,
  )}\n`;
}

export async function materializeAgentAuthoredProjectArtifact(
  projectRoot: string,
  artifact: AgentAuthoredProjectArtifact,
  options: MaterializeAgentAuthoredProjectArtifactOptions = {},
): Promise<readonly string[]> {
  const canonical = validateAgentAuthoredProjectArtifact(
    artifact,
    options.limits,
  );
  const root = path.resolve(projectRoot);
  const rootStats = await lstat(root);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new Error("Artifact project root must be a real directory.");
  }
  if ((await readdir(root)).length !== 0) {
    throw new Error("Artifact project root must be empty.");
  }

  for (const file of canonical.files) {
    const target = path.resolve(root, ...file.path.split("/"));
    assertContained(root, target);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, {
      encoding: "utf8",
      flag: "wx",
    });
  }
  return canonical.files.map((file) => file.path);
}

function validateLimits(
  limits: Partial<AgentAuthoredProjectArtifactLimits> | undefined,
): AgentAuthoredProjectArtifactLimits {
  return {
    maxFiles: requireLimit(
      limits?.maxFiles ?? defaultLimits.maxFiles,
      1,
      1_024,
      "maxFiles",
    ),
    maxFileBytes: requireLimit(
      limits?.maxFileBytes ?? defaultLimits.maxFileBytes,
      1,
      16_777_216,
      "maxFileBytes",
    ),
    maxTotalBytes: requireLimit(
      limits?.maxTotalBytes ?? defaultLimits.maxTotalBytes,
      1,
      67_108_864,
      "maxTotalBytes",
    ),
  };
}

function validatePathSet(paths: readonly string[]): void {
  const foldedPaths = paths
    .map((filePath) => filePath.toLowerCase())
    .sort(compareText);
  for (const [index, currentFolded] of foldedPaths.entries()) {
    if (index > 0 && foldedPaths[index - 1] === currentFolded) {
      throw new Error("Artifact file paths must be unique without case collisions.");
    }
    const previousFolded = foldedPaths[index - 1];
    if (
      previousFolded !== undefined
      && currentFolded.startsWith(`${previousFolded}/`)
    ) {
      throw new Error("An artifact path cannot be both a file and a directory.");
    }
  }
}

function requireProjectPath(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 512
    || value.startsWith("/")
    || value.includes("\\")
    || value.includes(":")
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`${label} must be a portable root-relative POSIX path.`);
  }
  const segments = value.split("/");
  if (
    segments.some((segment) =>
      segment.length === 0
      || segment.length > 255
      || segment === "."
      || segment === ".."
      || !/^[A-Za-z0-9._@+-]+$/u.test(segment)
      || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment)
    )
  ) {
    throw new Error(`${label} contains a non-portable path segment.`);
  }
  return value;
}

function requireFileContent(
  value: unknown,
  maxFileBytes: number,
  label: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  if (Buffer.byteLength(value, "utf8") > maxFileBytes) {
    throw new Error(`${label} exceeds ${maxFileBytes} bytes.`);
  }
  if (value.includes("\r")) {
    throw new Error(`${label} must use LF line endings.`);
  }
  if (!value.endsWith("\n")) {
    throw new Error(`${label} must end with one newline.`);
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw new Error(`${label} contains forbidden control characters.`);
  }
  return value;
}

function requireRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort(compareText);
  const canonicalExpected = [...expected].sort(compareText);
  if (JSON.stringify(actual) !== JSON.stringify(canonicalExpected)) {
    throw new Error(`${label} contains unknown or missing fields.`);
  }
}

function requireLimit(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function assertContained(parent: string, child: string): void {
  const relative = path.relative(parent, child);
  if (
    relative.length === 0
    || relative === ".."
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    throw new Error("Artifact path must remain inside its project root.");
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
