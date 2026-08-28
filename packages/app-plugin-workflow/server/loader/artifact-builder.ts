import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  WorkflowFlatIr,
  WorkflowSourceAst,
} from '../instructions/definition.js';
import type { ScannedPackage } from './package-scanner.js';
import type { WorkflowServerEntryManifest } from './server-entry-builder.js';

export interface WorkflowArtifactDefinition extends WorkflowFlatIr {
  readonly formatVersion: 1;
  readonly key: string;
  readonly server?: Readonly<{ run: Readonly<Record<string, string>> }>;
}

export interface WorkflowArtifactBuildInput {
  scanned: ScannedPackage;
  definition: WorkflowSourceAst;
  flatIr: WorkflowFlatIr;
  serverEntries?: Readonly<Record<string, WorkflowServerEntryManifest>>;
  serverEntryFiles?: ReadonlyMap<string, string>;
}

export interface WorkflowArtifactBuildResult {
  digest: string;
  workflow: WorkflowArtifactDefinition;
  files: ReadonlyMap<string, string>;
}

export interface WorkflowPackageBuildOptions {
  instructions: Map<
    string,
    import('../engine/types.js').WorkflowInstructionClass
  >;
  bareImportAllowlist?: readonly string[];
}

export interface WorkflowArtifactDigestFile {
  readonly path: string;
  readonly content: string | Uint8Array;
}

function normalizeJson(
  value: import('../engine/types.js').JsonValue,
): import('../engine/types.js').JsonValue {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizeJson(value[key])]),
    );
  }
  return value;
}

export function canonicalWorkflowJson(
  value: WorkflowArtifactDefinition,
): string {
  return `${JSON.stringify(normalizeJson(value as object as import('../engine/types.js').JsonObject), null, 2)}\n`;
}

export function buildWorkflowArtifact(
  input: WorkflowArtifactBuildInput,
): WorkflowArtifactBuildResult {
  const runEntries = Object.fromEntries(
    Object.values(input.serverEntries ?? {})
      .sort((left, right) =>
        Buffer.from(left.source).compare(Buffer.from(right.source)),
      )
      .map((entry) => [
        entry.source.replaceAll('\\', '/').replace(/^\.\//, ''),
        entry.output,
      ]),
  );
  const workflow: WorkflowArtifactDefinition = {
    formatVersion: 1,
    key: input.scanned.key,
    ...input.flatIr,
    ...(Object.keys(runEntries).length === 0
      ? {}
      : { server: { run: runEntries } }),
  };
  const files = new Map<string, string>([
    ['workflow.json', canonicalWorkflowJson(workflow)],
    ...(input.serverEntryFiles ?? new Map<string, string>()),
  ]);
  return {
    digest: computeWorkflowArtifactDigest(
      [...files].map(([filePath, content]) => ({ path: filePath, content })),
    ),
    workflow,
    files,
  };
}

export async function buildWorkflowPackage(
  packageRoot: string,
  options: WorkflowPackageBuildOptions,
): Promise<WorkflowArtifactBuildResult> {
  const [
    { scanWorkflowPackage },
    { parseWorkflowSource },
    { validateWorkflowSourceAst },
    { compileWorkflowSource },
    { WorkflowSourceCheckError },
    { buildWorkflowServerEntries },
  ] = await Promise.all([
    import('./package-scanner.js'),
    import('./source-parser.js'),
    import('./source-validator.js'),
    import('./source-compiler.js'),
    import('./source-issues.js'),
    import('./server-entry-builder.js'),
  ]);
  const scanned = await scanWorkflowPackage(packageRoot);
  const filePath = path.join(scanned.root, 'workflow.ts');
  const parsed = await parseWorkflowSource(filePath);
  const issues = validateWorkflowSourceAst(parsed.ast, filePath, {
    instructions: options.instructions,
  });
  if (issues.length > 0) throw new WorkflowSourceCheckError(issues);
  const flatIr = compileWorkflowSource(parsed.ast, filePath, {
    instructions: options.instructions,
  });
  const server = await buildWorkflowServerEntries(scanned, flatIr, {
    ...(options.bareImportAllowlist === undefined
      ? {}
      : { bareImportAllowlist: options.bareImportAllowlist }),
  });
  return buildWorkflowArtifact({
    scanned,
    definition: parsed.ast,
    flatIr,
    serverEntries: server.entries,
    serverEntryFiles: server.files,
  });
}

export async function writeWorkflowArtifact(
  result: WorkflowArtifactBuildResult,
  distRoot: string,
): Promise<string> {
  const keyRoot = path.join(distRoot, result.workflow.key);
  await fs.mkdir(distRoot, { recursive: true });
  const temporaryKeyRoot = await fs.mkdtemp(
    path.join(distRoot, `.${result.workflow.key}-tmp-`),
  );
  const temporaryDestination = path.join(temporaryKeyRoot, result.digest);
  for (const [relativePath, content] of result.files) {
    const target = path.join(temporaryDestination, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  await fs.rm(keyRoot, { recursive: true, force: true });
  await fs.rename(temporaryKeyRoot, keyRoot);
  return path.join(keyRoot, result.digest);
}

export function computeWorkflowArtifactDigest(
  files: readonly WorkflowArtifactDigestFile[],
): string {
  const hash = createHash('sha256');
  for (const file of [...files].sort(comparePaths)) {
    const normalizedPath = file.path.replaceAll('\\', '/');
    const content =
      typeof file.content === 'string'
        ? Buffer.from(file.content)
        : Buffer.from(file.content);
    hash
      .update(normalizedPath)
      .update('\0')
      .update(String(content.byteLength))
      .update('\0')
      .update(content)
      .update('\0');
  }
  return hash.digest('hex');
}

function comparePaths(left: { path: string }, right: { path: string }): number {
  return Buffer.from(left.path).compare(Buffer.from(right.path));
}
