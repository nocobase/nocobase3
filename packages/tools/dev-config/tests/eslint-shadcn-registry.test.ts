import type { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import {
  createClientLibraryConfig,
  createPortalConfig,
} from '../eslint/index.ts';

const named = (configs: Linter.Config[], name: string): Linter.Config => {
  const config = configs.find((entry) => entry.name === name);
  expect(config, `missing config block ${name}`).toBeDefined();
  return config as Linter.Config;
};

describe('shadcn/ui registry exceptions', () => {
  const portal = createPortalConfig();

  it('relaxes the registry rules for the registry paths only', () => {
    const registry = named(portal, '@nocobase/dev-config/shadcn-registry');

    expect(registry.files).toEqual([
      'client/components/ui/**/*.tsx',
      'client/hooks/use-mobile.ts',
    ]);
    expect(registry.rules?.['react-refresh/only-export-components']).toBe(
      'off',
    );
    expect(registry.rules?.['@eslint-react/no-array-index-key']).toBe('off');
  });

  it('relaxes the recharts payload rules for the chart wrapper only', () => {
    const chart = named(portal, '@nocobase/dev-config/shadcn-registry-chart');

    expect(chart.files).toEqual(['client/components/ui/chart.tsx']);
    expect(chart.rules?.['@typescript-eslint/no-unsafe-member-access']).toBe(
      'off',
    );
  });

  it('lets a portal override the relaxation', () => {
    const configs = createPortalConfig({
      overrides: [
        {
          name: 'local/strict-registry',
          files: ['client/components/ui/**/*.tsx'],
          rules: { 'react-refresh/only-export-components': 'error' },
        },
      ],
    });

    const registryIndex = configs.findIndex(
      (entry) => entry.name === '@nocobase/dev-config/shadcn-registry',
    );
    const overrideIndex = configs.findIndex(
      (entry) => entry.name === 'local/strict-registry',
    );

    expect(overrideIndex).toBeGreaterThan(registryIndex);
  });

  it('does not reach library packages, which have no registry directory', () => {
    const names = createClientLibraryConfig().map((entry) => entry.name);

    expect(names).not.toContain('@nocobase/dev-config/shadcn-registry');
  });
});
