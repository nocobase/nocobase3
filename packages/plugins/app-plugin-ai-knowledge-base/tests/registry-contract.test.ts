import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(fileURLToPath(import.meta.url), '../..');

type RegistryItem = {
  name: string;
  dependencies: string[];
  registryDependencies: string[];
  meta: {
    ownership: string;
    upgradePolicy: string;
    nocobase: { requiresPlugins: Record<string, string> };
  };
  source: { root: string; target: string; include: string[] };
};

async function sourceFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else result.push(absolute);
    }
  }
  await visit(root);
  return result;
}

describe('AI Knowledge Base Registry contract', () => {
  it('publishes three independently owned and versioned items', async () => {
    const config = JSON.parse(
      await readFile(path.join(packageRoot, 'registry.config.json'), 'utf8'),
    ) as { items: RegistryItem[] };

    expect(config.items.map(({ name }) => name)).toEqual([
      'providers',
      'components',
      'workspace',
    ]);
    expect(config.items.map(({ source }) => source.target)).toEqual([
      'client/extensions/nocobase-ai-knowledge-base-providers',
      'client/extensions/nocobase-ai-knowledge-base-components',
      'client/extensions/nocobase-ai-knowledge-base-workspace',
    ]);

    for (const item of config.items) {
      expect(item.source.root).toBe(`registry/${item.name}`);
      expect(item.source.include).toEqual(['.']);
      expect(item.meta).toMatchObject({
        ownership: 'application',
        upgradePolicy: 'three-way-merge',
        nocobase: {
          requiresPlugins: {
            '@nocobase/app-plugin-ai-knowledge-base':
              expect.stringMatching(/^>=.+ <.+$/),
          },
        },
      });
      expect(item.dependencies.every((value) => value.includes('@'))).toBe(
        true,
      );
    }

    expect(config.items[1]?.registryDependencies).toContain(
      '@nocobase-ai-knowledge-base/providers',
    );
    expect(config.items[2]?.registryDependencies).toEqual(
      expect.arrayContaining([
        '@nocobase-ai-knowledge-base/providers',
        '@nocobase-ai-knowledge-base/components',
      ]),
    );
  });

  it('keeps each item self-contained and free of legacy or server imports', async () => {
    for (const item of ['providers', 'components', 'workspace']) {
      const root = path.join(packageRoot, 'registry', item);
      const files = await sourceFiles(root);
      expect(files.some((file) => path.basename(file) === 'README.md')).toBe(
        true,
      );
      expect(files.some((file) => path.basename(file) === 'index.ts')).toBe(
        true,
      );

      for (const file of files.filter((candidate) =>
        /\.tsx?$/.test(candidate),
      )) {
        const source = await readFile(file, 'utf8');
        expect(source).not.toMatch(/@nocobase\/portal-sdk/);
        expect(source).not.toMatch(/src\/extensions/);
        expect(source).not.toMatch(
          /(?:^|['"])(?:\.\.\/)+(?:server|database)\//m,
        );
        expect(source).not.toMatch(/storageId/);
      }
    }
  });

  it('builds and materializes all targets without overwriting', () => {
    const repositoryRoot = path.resolve(packageRoot, '../../..');
    const outputRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'nocobase-ai-knowledge-base-registry-'),
    );
    const registryScript = path.join(repositoryRoot, 'scripts/registry.mjs');

    try {
      execFileSync(
        process.execPath,
        [registryScript, 'build', '--package', packageRoot],
        { cwd: repositoryRoot },
      );
      execFileSync(
        process.execPath,
        [
          registryScript,
          'materialize',
          '--package',
          packageRoot,
          '--output-root',
          outputRoot,
        ],
        { cwd: repositoryRoot },
      );

      for (const target of ['providers', 'components', 'workspace']) {
        expect(
          fs.existsSync(
            path.join(
              outputRoot,
              'client/extensions',
              `nocobase-ai-knowledge-base-${target}`,
              'index.ts',
            ),
          ),
        ).toBe(true);
      }

      expect(() =>
        execFileSync(
          process.execPath,
          [
            registryScript,
            'materialize',
            '--package',
            packageRoot,
            '--output-root',
            outputRoot,
          ],
          { cwd: repositoryRoot, stdio: 'pipe' },
        ),
      ).toThrow();
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });
});
