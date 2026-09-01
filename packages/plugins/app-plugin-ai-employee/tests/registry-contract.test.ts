import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface RegistryItem {
  readonly dependencies: readonly string[];
  readonly meta: {
    readonly nocobase?: {
      readonly requiresPlugins?: Readonly<Record<string, string>>;
    };
    readonly ownership: string;
    readonly upgradePolicy: string;
  };
  readonly name: string;
  readonly registryDependencies: readonly string[];
  readonly source: {
    readonly include: readonly string[];
    readonly root: string;
    readonly target: string;
  };
  readonly type: string;
}

interface RegistryConfig {
  readonly items: readonly RegistryItem[];
}

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repositoryRoot = path.resolve(packageRoot, '../../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(packageRoot, relativePath), 'utf8');
}

function filesUnder(relativeRoot: string): readonly string[] {
  const absoluteRoot = path.join(packageRoot, relativeRoot);
  return fs
    .readdirSync(absoluteRoot, { withFileTypes: true })
    .flatMap((entry) => {
      const relativeEntry = path.join(relativeRoot, entry.name);
      return entry.isDirectory() ? filesUnder(relativeEntry) : [relativeEntry];
    });
}

describe('AI Employee Registry contract', () => {
  const config = JSON.parse(read('registry.config.json')) as RegistryConfig;

  it('publishes one application-owned frontend item', () => {
    expect(config.items).toHaveLength(1);
    expect(config.items[0]).toMatchObject({
      name: 'nocobase-ai',
      type: 'registry:component',
      registryDependencies: [],
      source: {
        root: 'registry/nocobase-ai',
        target: 'client/extensions/nocobase-ai',
        include: ['.'],
      },
      meta: {
        ownership: 'application',
        upgradePolicy: 'three-way-merge',
        nocobase: {
          requiresPlugins: {
            '@nocobase/app-plugin-ai-employee': '>=0.0.1 <0.1.0',
          },
        },
      },
    });
  });

  it('contains the complete browser UI and Demo tree without copied Server implementation', () => {
    const item = config.items[0];
    if (!item) throw new Error('Missing nocobase-ai Registry item.');
    const files = filesUnder(item.source.root);
    expect(files).toContain('registry/nocobase-ai/index.ts');
    expect(files).toContain('registry/nocobase-ai/dev/ai-employee-page.tsx');
    expect(files).toContain('registry/nocobase-ai/demo/index.tsx');
    expect(files).toContain('registry/nocobase-ai/demo/floating.tsx');
    expect(files).toContain('registry/nocobase-ai/demo/shortcut.tsx');
    expect(files).toContain('registry/nocobase-ai/demo/page-context.tsx');
    expect(files).toContain('registry/nocobase-ai/demo/tool-cards.tsx');
    expect(files.some((file) => file.endsWith('extension.tsx'))).toBe(false);

    const source = files.map(read).join('\n');
    for (const banned of [
      '@nocobase/app-plugin-ai-employee/server',
      'createAIConversationsRouter',
      'DatabaseManager',
      'defineApiRoutes',
      'defineRootRoutes',
    ]) {
      expect(source).not.toContain(banned);
    }
    expect(source).toContain("from '@nocobase/app-portal-sdk/client'");
    expect(source).toContain(
      'apiUrl: resolveNocoBaseAIUrl(this.client.getApiUrl())',
    );
  });

  it('keeps every relative import inside the item root', () => {
    const item = config.items[0];
    if (!item) throw new Error('Missing nocobase-ai Registry item.');
    const root = path.resolve(packageRoot, item.source.root);
    for (const relativeFile of filesUnder(item.source.root).filter((file) =>
      /\.[cm]?[jt]sx?$/u.test(file),
    )) {
      const source = read(relativeFile);
      for (const match of source.matchAll(
        /(?:from\s+|import\(\s*)['"](\.[^'"]+)['"]/gu,
      )) {
        const resolved = path.resolve(
          path.dirname(path.join(packageRoot, relativeFile)),
          match[1],
        );
        expect(path.relative(root, resolved).startsWith('..')).toBe(false);
      }
    }
  });

  it('builds and materializes the complete item', () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'nocobase-ai-registry-'),
    );
    try {
      execFileSync(
        process.execPath,
        [
          path.join(repositoryRoot, 'scripts/registry.mjs'),
          'build',
          '--package',
          packageRoot,
        ],
        { cwd: repositoryRoot },
      );
      execFileSync(
        process.execPath,
        [
          path.join(repositoryRoot, 'scripts/registry.mjs'),
          'materialize',
          '--package',
          packageRoot,
          '--output-root',
          temporaryRoot,
        ],
        { cwd: repositoryRoot },
      );
      expect(
        fs.existsSync(
          path.join(
            temporaryRoot,
            'client/extensions/nocobase-ai/dev/ai-employee-page.tsx',
          ),
        ),
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(temporaryRoot, 'client/extensions/nocobase-ai/index.ts'),
        ),
      ).toBe(true);
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
