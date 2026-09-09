import { realpath } from "node:fs/promises";
import path from "node:path";
import { extractHonoJsxFormDocument } from "@0disoft/mensor-compiler/hono-jsx";
import { serializeFormIndex, type FormIndex } from "@0disoft/mensor-contract";
import { assertHonoJsxBuild, assertHonoJsxConfiguration, assertHonoJsxRenderer, assertHonoJsxRoute } from "./hono-jsx-activation.js";
import { normalizeSourcePath, readSource, TypeScriptTemplateFormIndexError } from "./template-source.js";

export interface HonoJsxFormIndexOptions {
  readonly root: string;
  readonly sources: readonly string[];
  readonly jsxConfig: string;
  readonly buildConfig: string;
  readonly renderer: string;
  readonly producerVersion: string;
}

export async function produceHonoJsxFormIndex(options: HonoJsxFormIndexOptions): Promise<{ value: FormIndex; text: string }> {
  const fail = (message: string): never => {
    throw new TypeScriptTemplateFormIndexError("hono_jsx.activation_invalid", message);
  };
  if (options.sources.length === 0) fail("At least one explicit TSX source is required.");
  if (options.sources.length > 60) fail("At most 60 TSX sources may be selected.");
  const root = await realpath(options.root).catch(() => fail("The selected project root could not be resolved."));
  const sources = [...new Set(options.sources.map(normalizeSourcePath))].sort();
  const renderer = normalizeSourcePath(options.renderer);
  const jsxConfig = normalizeSourcePath(options.jsxConfig);
  const buildConfig = normalizeSourcePath(options.buildConfig);
  const applicationRoot = path.posix.dirname(buildConfig);
  if (path.posix.basename(buildConfig) !== "vite.config.ts"
    || jsxConfig !== path.posix.join(applicationRoot, "tsconfig.json")
    || renderer !== path.posix.join(applicationRoot, "app/routes/_renderer.tsx")
    || sources.some((file) => file === renderer || !file.endsWith(".tsx") || path.posix.dirname(file) !== path.posix.dirname(renderer))) {
    fail("Select the default HonoX layout: vite.config.ts, tsconfig.json and routes directly beside app/routes/_renderer.tsx.");
  }
  const inputs = [jsxConfig, buildConfig, renderer, ...sources];
  if (new Set(inputs).size !== inputs.length) fail("Configuration, renderer and route paths must be distinct.");
  const snapshot = new Map<string, Awaited<ReturnType<typeof readSource>>>();
  for (const file of inputs) snapshot.set(file, await readSource(root, file));
  const text = (file: string): string => snapshot.get(file)!.text;
  assertHonoJsxConfiguration(jsxConfig, text(jsxConfig));
  assertHonoJsxBuild(buildConfig, text(buildConfig));
  assertHonoJsxRenderer(renderer, text(renderer));
  const documents: FormIndex["documents"][number][] = inputs.slice(0, 3).map((file) => ({
    path: file, contentDigest: snapshot.get(file)!.digest,
    sourceKind: "mensor/hono-jsx-activation", inspection: { state: "complete" }, forms: [],
  }));
  for (const file of sources) {
    assertHonoJsxRoute(file, text(file));
    try {
      documents.push(extractHonoJsxFormDocument(file, text(file)));
    } catch (error) {
      const failure = error as { code?: unknown; message?: unknown };
      throw new TypeScriptTemplateFormIndexError(
        typeof failure.code === "string" ? failure.code : "hono_jsx.source_invalid",
        typeof failure.message === "string" ? failure.message : "JSX source could not be indexed.", file,
      );
    }
  }
  for (const file of inputs) {
    if ((await readSource(root, file)).digest !== snapshot.get(file)!.digest) fail("An input changed during JSX indexing.");
  }
  const value: FormIndex = { schemaVersion: 1, producer: { name: "mensor/hono-jsx", version: options.producerVersion }, documents };
  return { value, text: serializeFormIndex(value) };
}
