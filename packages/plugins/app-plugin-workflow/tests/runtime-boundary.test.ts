import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import packageMetadata from '../package.json' with { type: 'json' };

const pluginRoot = fileURLToPath(new URL('..', import.meta.url));
const staticImportPattern =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;

async function runtimeModuleGraph(entry: string): Promise<Set<string>> {
  const visited = new Set<string>();
  const visit = async (file: string): Promise<void> => {
    if (visited.has(file)) return;
    visited.add(file);
    const source = await fs.readFile(file, 'utf8');
    for (const match of source.matchAll(staticImportPattern)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      const resolved = path.resolve(
        path.dirname(file),
        specifier.replace(/\.js$/, '.ts'),
      );
      await visit(resolved);
    }
  };
  await visit(entry);
  return visited;
}

describe('workflow server runtime boundary', () => {
  it('does not load build-only modules or compiler dependencies', async () => {
    const graph = await runtimeModuleGraph(
      path.join(pluginRoot, 'server/plugin.ts'),
    );
    expect(
      [...graph].filter((file) =>
        file.startsWith(path.join(pluginRoot, 'build')),
      ),
    ).toEqual([]);

    const imports = await Promise.all(
      [...graph].map((file) => fs.readFile(file, 'utf8')),
    );
    expect(imports.join('\n')).not.toMatch(
      /(?:from|import\s*\()\s*['"](?:esbuild|typescript)['"]/,
    );
    expect(packageMetadata.dependencies).not.toHaveProperty('esbuild');
    expect(packageMetadata.dependencies).not.toHaveProperty('typescript');
    expect(packageMetadata.peerDependencies).not.toHaveProperty('esbuild');
    expect(packageMetadata.devDependencies).not.toHaveProperty('esbuild');
  });
});
