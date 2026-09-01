import { builtinModules } from 'node:module';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import type { WorkflowFlatIr } from '../instructions/definition.js';
import {
  assertPackageRelativePath,
  type ScannedPackage,
} from './package-scanner.js';

export interface WorkflowServerEntryManifest {
  source: string;
  output: string;
  exports: readonly string[];
}
export interface WorkflowServerEntryBuildResult {
  entries: Readonly<Record<string, WorkflowServerEntryManifest>>;
  files: ReadonlyMap<string, string>;
  externalPackages: readonly string[];
}
export interface WorkflowServerEntryBuilderOptions {
  bareImportAllowlist?: readonly string[];
}

const BUILTINS: ReadonlySet<string> = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);
const FORBIDDEN: readonly RegExp[] = [
  /(^|\/)\.env(?:\.|$)/i,
  /secret/i,
  /credentials?/i,
  /\.(?:pem|key|crt|cer|p12|pfx)$/i,
];

function stableEntryKey(source: string): string {
  return `run:${createHash('sha256').update(source).digest('hex').slice(0, 16)}`;
}
function validateSourcePath(source: string): string {
  const normalized = assertPackageRelativePath(source);
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized))
    throw new Error(`Run script URL is not allowed: ${source}`);
  if (FORBIDDEN.some((pattern) => pattern.test(normalized)))
    throw new Error(
      `Run script references forbidden secret material: ${source}`,
    );
  return normalized;
}

export async function buildWorkflowServerEntries(
  scanned: ScannedPackage,
  ir: WorkflowFlatIr,
  options: WorkflowServerEntryBuilderOptions = {},
): Promise<WorkflowServerEntryBuildResult> {
  const modules = [
    ...new Set(
      ir.nodes
        .filter((node) => node.type === 'run')
        .map((node) => {
          const module = node.config.module;
          if (typeof module !== 'string')
            throw new Error(`Run node "${node.key}" module must be a string`);
          return module;
        }),
    ),
  ].sort();
  const included = new Set(scanned.entries.map((entry) => entry.path));
  const entries: Record<string, WorkflowServerEntryManifest> = {};
  const files = new Map<string, string>();
  const allowed = new Set(options.bareImportAllowlist ?? []);
  const usedExternal = new Set<string>();
  const rootPrefix = `${scanned.root}${path.sep}`;
  for (const module of modules) {
    const source = validateSourcePath(`${module}.ts`);
    if (!included.has(source))
      throw new Error(
        `Run script "${source}" is not included in the workflow package`,
      );
    const absolute = path.join(scanned.root, source);
    const real = await fs.realpath(absolute);
    if (!real.startsWith(rootPrefix))
      throw new Error(`Run script "${source}" escapes the workflow package`);
    const output = `server/run/${stableEntryKey(source).slice(4)}.cjs`;
    const plugin = {
      name: 'workflow-import-policy',
      setup(builder: import('esbuild').PluginBuild) {
        builder.onResolve({ filter: /.*/ }, async (args) => {
          if (args.pluginData === 'workflow-policy-checked') return;
          if (args.kind === 'entry-point') return;
          if (BUILTINS.has(args.path))
            return { path: args.path, external: true };
          if (!args.path.startsWith('.') && !path.isAbsolute(args.path)) {
            if (!allowed.has(args.path))
              return {
                errors: [
                  {
                    text: `Bare import "${args.path}" is not in the workflow allowlist`,
                  },
                ],
              };
            usedExternal.add(args.path);
            return { path: args.path, external: true };
          }
          const resolved = await builder.resolve(args.path, {
            resolveDir: args.resolveDir,
            kind: args.kind,
            pluginData: 'workflow-policy-checked',
          });
          if (resolved.errors.length) return resolved;
          const realDependency = await fs
            .realpath(resolved.path)
            .catch(() => resolved.path);
          const relativeDependency = path
            .relative(scanned.root, realDependency)
            .replaceAll('\\', '/');
          if (
            !realDependency.startsWith(rootPrefix) ||
            relativeDependency.startsWith('../')
          )
            return {
              errors: [
                { text: `Import escapes workflow package: ${args.path}` },
              ],
            };
          if (!included.has(relativeDependency))
            return {
              errors: [
                {
                  text: `Import is not included in workflow package: ${relativeDependency}`,
                },
              ],
            };
          if (FORBIDDEN.some((pattern) => pattern.test(realDependency)))
            return {
              errors: [
                {
                  text: `Import references forbidden secret material: ${args.path}`,
                },
              ],
            };
          return { path: realDependency };
        });
      },
    };
    const common = {
      entryPoints: [absolute],
      bundle: true,
      write: false,
      platform: 'node' as const,
      target: 'node22',
      sourcemap: false as const,
      absWorkingDir: scanned.root,
      metafile: true,
      plugins: [plugin],
    };
    const analyzed = await build({ ...common, format: 'esm' });
    const exported = Object.values(analyzed.metafile?.outputs ?? {}).flatMap(
      (metadata) => metadata.exports,
    );
    if (!exported.includes('run'))
      throw new Error(
        `Run script "${source}" must export a function named run`,
      );
    const result = await build({ ...common, format: 'cjs' });
    const bundle = result.outputFiles?.[0]?.text ?? '';
    entries[stableEntryKey(source)] = {
      source,
      output,
      exports: [...exported].sort(),
    };
    files.set(output, bundle);
  }
  return {
    entries: Object.freeze(entries),
    files,
    externalPackages: [...usedExternal].sort(),
  };
}
