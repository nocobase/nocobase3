import { describe, expect, it } from 'vitest';

import {
  normalizePluginCapabilities,
  type PluginCapability,
} from '../src/lib/capabilities.ts';
import {
  DEFAULT_TEMPLATE_DIRECTORY,
  listTemplateFiles,
} from '../src/lib/template.ts';

const foundation = [
  '.gitignore',
  '.prettierignore',
  'CHANGELOG.md',
  'eslint.config.js',
  'package.json',
  'package.ts',
  'README.md',
  'tsconfig.json',
] as const;

const capabilityFiles: Readonly<Record<PluginCapability, readonly string[]>> = {
  database: [
    'database/README.md',
    'database/migrations/__NOCOBASE_MIGRATION_NAME__.ts.example',
    'database/seeds/__NOCOBASE_SEED_NAME__.ts.example',
    'server/plugin.ts',
    'tests/database.test.ts',
    'tests/plugin.test.ts',
  ],
  'server.providers': [
    'server/plugin.ts',
    'server/providers/__NOCOBASE_SHORT_NAME__.ts',
    'server/providers/index.ts',
    'server/services/__NOCOBASE_SHORT_NAME__.ts',
    'server/tokens.ts',
    'tests/plugin.test.ts',
    'tests/server-provider.test.ts',
  ],
  'server.routes': [
    'server/plugin.ts',
    'server/routes/index.ts',
    'tests/plugin.test.ts',
    'tests/routes.test.ts',
  ],
  'server.jobs': [
    'server/jobs/__NOCOBASE_SHORT_NAME__.ts',
    'server/plugin.ts',
    'tests/jobs.test.ts',
    'tests/plugin.test.ts',
  ],
  'client.routes': [
    'client/index.ts',
    'client/locales/en-US.ts',
    'client/locales/index.ts',
    'client/locales/zh-CN.ts',
    'client/plugin.ts',
    'client/routes.ts',
    'tests/client.test.ts',
  ],
  'client.components': [
    'client/components/plugin-component.tsx',
    'tests/component.test.tsx',
  ],
  'client.providers': [
    'client/components/provider.tsx',
    'client/contexts.ts',
    'client/index.ts',
    'client/locales/en-US.ts',
    'client/locales/index.ts',
    'client/locales/zh-CN.ts',
    'client/plugin.ts',
    'client/providers.ts',
    'tests/client-provider.test.tsx',
  ],
  'client.bootstrap': [
    'client/bootstrap.ts',
    'client/index.ts',
    'client/locales/en-US.ts',
    'client/locales/index.ts',
    'client/locales/zh-CN.ts',
    'client/plugin.ts',
    'tests/bootstrap.test.ts',
  ],
  registry: [
    'client/styles.css',
    'components.json',
    'registry/component-ui/README.md',
    'registry/component-ui/index.ts',
    'registry/component-ui/plugin-feature-card.tsx',
    'registry.config.json',
  ],
  skills: ['skills/nocobase-app-plugin-__NOCOBASE_SHORT_NAME__/SKILL.md'],
};

function expectExactFiles(
  actual: readonly string[],
  expected: readonly string[],
): void {
  expect(actual).toHaveLength(expected.length);
  expect(actual).toEqual(expect.arrayContaining(expected));
}

describe('bundled capability templates', () => {
  it('selects only the package foundation for an empty plugin', async () => {
    await expect(
      listTemplateFiles(
        DEFAULT_TEMPLATE_DIRECTORY,
        undefined,
        normalizePluginCapabilities([]),
      ),
    ).resolves.toEqual(foundation);
  });

  it.each(
    Object.entries(capabilityFiles) as Array<
      [PluginCapability, readonly string[]]
    >,
  )('selects the exact %s file set', async (capability, selectedFiles) => {
    const files = await listTemplateFiles(
      DEFAULT_TEMPLATE_DIRECTORY,
      undefined,
      normalizePluginCapabilities([capability]),
    );

    expectExactFiles(files, [...foundation, ...selectedFiles]);
  });

  it.each([
    ['client-only', ['client.routes', 'client.components']],
    ['server-only', ['server.providers', 'server.routes']],
    [
      'full-stack',
      [
        'client.routes',
        'client.components',
        'server.providers',
        'server.routes',
      ],
    ],
    ['data-oriented', ['database', 'server.providers', 'server.routes']],
    ['App Agent integration', ['server.routes', 'skills']],
    ['editable UI distribution', ['client.components', 'registry']],
  ] as const)('composes the exact %s file set', async (_name, capabilities) => {
    const files = await listTemplateFiles(
      DEFAULT_TEMPLATE_DIRECTORY,
      undefined,
      normalizePluginCapabilities(capabilities),
    );
    const selectedFiles = capabilities.flatMap(
      (capability) => capabilityFiles[capability],
    );

    expectExactFiles(files, [...new Set([...foundation, ...selectedFiles])]);
  });
});
