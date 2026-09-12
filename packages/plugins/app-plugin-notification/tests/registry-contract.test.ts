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

describe('@nocobase/app-plugin-notification Registry contract', () => {
  it('publishes application-owned notification logs source', () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(packageRoot, 'registry.config.json'), 'utf8'),
    ) as RegistryConfig;

    expect(config.items).toEqual([
      expect.objectContaining({
        name: 'logs-ui',
        dependencies: expect.arrayContaining([
          '@nocobase/app-portal-sdk@^0.0.1-beta.1',
        ]),
        registryDependencies: ['alert', 'badge', 'button', 'card', 'table'],
        source: {
          root: 'registry/logs-ui',
          target: 'client/extensions/nocobase-notification-logs-ui',
          include: ['.'],
        },
      }),
    ]);
    expect(
      fs.existsSync(path.join(packageRoot, 'registry/logs-ui/index.ts')),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(packageRoot, 'registry/logs-ui/extension.ts')),
    ).toBe(false);
  });
});
