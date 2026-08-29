import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TEMPLATE_DIRECTORY,
  listTemplateFiles,
} from '../src/lib/template.ts';

describe('bundled template', () => {
  it('contains the complete plugin scaffold as readable files', async () => {
    const files = await listTemplateFiles();

    expect(files).toEqual(
      expect.arrayContaining([
        '.gitignore',
        'skills/nocobase-app-plugin-__NOCOBASE_SHORT_NAME__/SKILL.md',
        '.prettierignore',
        'CHANGELOG.md',
        'README.md',
        'client/bootstrap.ts',
        'client/components/provider.tsx',
        'client/contexts.ts',
        'client/index.ts',
        'client/pages/__NOCOBASE_SHORT_NAME__-page.tsx',
        'client/pages/settings.tsx',
        'client/plugin.ts',
        'client/providers.ts',
        'client/routes.ts',
        'client/styles.css',
        'components.json',
        'database/README.md',
        'eslint.config.js',
        'package.json',
        'registry.config.json',
        'registry/component-ui/README.md',
        'registry/component-ui/index.ts',
        'registry/component-ui/plugin-feature-card.tsx',
        'server/plugin.ts',
        'server/providers/__NOCOBASE_SHORT_NAME__.ts',
        'server/providers/index.ts',
        'server/routes/index.ts',
        'server/services/__NOCOBASE_SHORT_NAME__.ts',
        'server/tokens.ts',
        'tests/plugin.test.ts',
        'tests/client.test.ts',
        'tsconfig.json',
      ]),
    );

    const manifest = JSON.parse(
      await readFile(
        path.join(DEFAULT_TEMPLATE_DIRECTORY, 'package.template.json'),
        'utf8',
      ),
    ) as {
      exports?: Record<string, unknown>;
      publishConfig?: {
        access?: string;
        exports?: Record<string, unknown>;
      };
      devDependencies?: Record<string, string>;
      files?: string[];
      nocobase?: {
        registry?: { items?: Record<string, string> };
      };
      scripts?: Record<string, string>;
      version?: string;
    };
    expect(manifest.version).toBe('0.0.1');
    expect(manifest.publishConfig?.access).toBe('public');
    expect(manifest.devDependencies).toMatchObject({
      shadcn: '^4.13.1',
      tailwindcss: 'catalog:',
      'tw-animate-css': '^1.2.5',
    });
    expect(manifest.files).toEqual(
      expect.arrayContaining([
        'skills',
        'registry',
        'registry.config.json',
        'public/r',
      ]),
    );
    expect(manifest.nocobase?.registry?.items).toEqual({
      'component-ui': './registry/component-ui',
    });
    expect(manifest.scripts).toMatchObject({
      'registry:build': 'node ../../scripts/registry.mjs build --package .',
      'registry:materialize':
        'node ../../scripts/registry.mjs materialize --package .',
      prepack: 'pnpm registry:build',
    });
    expect(manifest.exports?.['./server/plugin']).toEqual({
      types: './server/plugin.ts',
      import: './server/plugin.ts',
    });
    expect(manifest.exports?.['./server/tokens']).toEqual({
      types: './server/tokens.ts',
      import: './server/tokens.ts',
    });
    expect(manifest.publishConfig?.exports?.['./server/plugin']).toEqual({
      types: './dist/server/plugin.d.ts',
      import: './dist/server/plugin.js',
    });
    expect(manifest.publishConfig?.exports?.['./server/tokens']).toEqual({
      types: './dist/server/tokens.d.ts',
      import: './dist/server/tokens.js',
    });
  });
});
