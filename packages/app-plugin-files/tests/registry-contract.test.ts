import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

interface PackageManifest {
  readonly exports: Readonly<Record<string, unknown>>;
  readonly files: readonly string[];
  readonly nocobase: {
    readonly registry: {
      readonly items: Readonly<Record<string, string>>;
    };
  };
}

interface RegistryConfig {
  readonly items: readonly {
    readonly name: string;
    readonly source: { readonly root: string; readonly target: string };
  }[];
}

describe('Files Registry contract', () => {
  it('publishes exactly page-ui, component-ui, and provider-ui', () => {
    const packageJson = readJson<PackageManifest>('package.json');
    const registryConfig = readJson<RegistryConfig>('registry.config.json');
    const items = registryConfig.items;

    expect(items.map(({ name }) => name)).toEqual([
      'page-ui',
      'component-ui',
      'provider-ui',
    ]);
    expect(packageJson.nocobase.registry.items).toEqual({
      'component-ui': './registry/component-ui',
      'page-ui': './registry/page-ui',
      'provider-ui': './registry/provider-ui',
    });
    expect(items.map(({ source }) => source.target)).toEqual([
      'client/extensions/nocobase-files-page-ui',
      'client/extensions/nocobase-files-component-ui',
      'client/extensions/nocobase-files-provider-ui',
    ]);
    expect(fs.existsSync(path.join(packageRoot, 'registry/file-upload'))).toBe(
      false,
    );
    expect(packageJson.files).toEqual(
      expect.arrayContaining(['README.md', 'components.json', 'registry']),
    );
    expect(packageJson.exports).toHaveProperty('./components.json');
    expect(packageJson.exports).toHaveProperty('./registry.config.json');
  });

  it('keeps page ownership and application UI boundaries explicit', () => {
    const extension = fs.readFileSync(
      path.join(packageRoot, 'registry/page-ui/extension.ts'),
      'utf8',
    );
    const page = fs.readFileSync(
      path.join(packageRoot, 'registry/page-ui/pages/files-page.tsx'),
      'utf8',
    );

    expect(extension).toContain('FILES_ROUTE_IDS.index');
    expect(extension).not.toMatch(/path:\s*['"]\/files/u);
    expect(extension).not.toMatch(/auth:\s*/u);
    expect(page).toContain("from '@/components/ui/button'");
    expect(page).not.toContain('client/default-pages');
    expect(page).not.toContain('client/components/ui');
  });
});

function readJson<Value>(file: string): Value {
  return JSON.parse(
    fs.readFileSync(path.join(packageRoot, file), 'utf8'),
  ) as Value;
}
