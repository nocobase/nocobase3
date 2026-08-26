import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface RegistrySource {
  readonly include: readonly string[];
  readonly root: string;
  readonly target: string;
}

interface RegistryItem {
  readonly dependencies: readonly string[];
  readonly name: string;
  readonly registryDependencies: readonly string[];
  readonly source: RegistrySource;
}

interface RegistryConfig {
  readonly items: readonly RegistryItem[];
}

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

describe('Registry example contract', () => {
  it('publishes page, component, and provider source independently', () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(packageRoot, 'registry.config.json'), 'utf8'),
    ) as RegistryConfig;
    const pageItem = config.items.find(({ name }) => name === 'page-ui');
    const componentItem = config.items.find(
      ({ name }) => name === 'component-ui',
    );
    const providerItem = config.items.find(
      ({ name }) => name === 'provider-ui',
    );

    expect(config.items).toHaveLength(3);
    expect(pageItem).toMatchObject({
      name: 'page-ui',
      registryDependencies: ['button'],
      source: {
        root: 'registry/page-ui',
        target: 'client/extensions/nocobase-registry-example-page-ui',
        include: ['.'],
      },
    });
    expect(pageItem?.dependencies).toContain(
      '@nocobase/app-plugin-registry-example@^0.0.1',
    );
    expect(componentItem).toMatchObject({
      name: 'component-ui',
      registryDependencies: ['button'],
      source: {
        root: 'registry/component-ui',
        target: 'client/extensions/nocobase-registry-example-component-ui',
      },
    });
    expect(providerItem).toMatchObject({
      name: 'provider-ui',
      registryDependencies: [],
      source: {
        root: 'registry/provider-ui',
        target: 'client/extensions/nocobase-registry-example-provider-ui',
      },
    });
    expect(
      fs.existsSync(path.join(packageRoot, 'registry/page-ui/pages')),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(packageRoot, 'registry/component-ui/extension.ts'),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(packageRoot, 'registry/provider-ui/extension.ts'),
      ),
    ).toBe(false);
  });
});
