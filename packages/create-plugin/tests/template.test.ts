import { describe, expect, it } from 'vitest';

import { normalizePluginCapabilities } from '../src/lib/capabilities.ts';
import {
  DEFAULT_TEMPLATE_DIRECTORY,
  listTemplateFiles,
} from '../src/lib/template.ts';

describe('bundled capability templates', () => {
  it('selects only the package foundation for an empty plugin', async () => {
    await expect(
      listTemplateFiles(
        DEFAULT_TEMPLATE_DIRECTORY,
        undefined,
        normalizePluginCapabilities([]),
      ),
    ).resolves.toEqual([
      '.gitignore',
      '.prettierignore',
      'CHANGELOG.md',
      'eslint.config.js',
      'package.json',
      'package.ts',
      'README.md',
      'tsconfig.json',
    ]);
  });

  it('selects an exact Server provider file set', async () => {
    await expect(
      listTemplateFiles(
        DEFAULT_TEMPLATE_DIRECTORY,
        undefined,
        normalizePluginCapabilities(['server.providers']),
      ),
    ).resolves.toEqual([
      '.gitignore',
      '.prettierignore',
      'CHANGELOG.md',
      'eslint.config.js',
      'package.json',
      'package.ts',
      'README.md',
      'server/plugin.ts',
      'server/providers/__NOCOBASE_SHORT_NAME__.ts',
      'server/providers/index.ts',
      'server/services/__NOCOBASE_SHORT_NAME__.ts',
      'server/tokens.ts',
      'tests/plugin.test.ts',
      'tests/server-provider.test.ts',
      'tsconfig.json',
    ]);
  });

  it('selects Database migrations and seeds as one capability', async () => {
    const files = await listTemplateFiles(
      DEFAULT_TEMPLATE_DIRECTORY,
      undefined,
      normalizePluginCapabilities(['database']),
    );
    expect(files).toEqual(
      expect.arrayContaining([
        'database/README.md',
        'database/migrations/__NOCOBASE_MIGRATION_NAME__.ts.example',
        'database/seeds/__NOCOBASE_SEED_NAME__.ts.example',
        'server/plugin.ts',
        'tests/database.test.ts',
        'tests/plugin.test.ts',
      ]),
    );
    expect(files.some((file) => file.startsWith('client/'))).toBe(false);
    expect(files.some((file) => file.startsWith('server/providers/'))).toBe(
      false,
    );
  });
});
