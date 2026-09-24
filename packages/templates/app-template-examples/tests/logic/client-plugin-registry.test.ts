// @vitest-environment node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import clientPlugins from '../../client/plugins.js';

const appRoot = fileURLToPath(new URL('../..', import.meta.url));

interface AppPackageJson {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

const appPackage = JSON.parse(
  readFileSync(path.join(appRoot, 'package.json'), 'utf8'),
) as AppPackageJson;

const registeredClientPackages = clientPlugins.plugins.map(
  (plugin) => plugin.packageName,
);

describe('client plugin registry consistency', () => {
  it('declares every client plugin as a dependency', () => {
    const undeclared = registeredClientPackages.filter(
      (packageName) =>
        appPackage.devDependencies?.[packageName] === undefined &&
        appPackage.dependencies?.[packageName] === undefined,
    );

    expect(undeclared).toEqual([]);
  });

  it('mounts the standard user and API key pages under Settings', () => {
    for (const [packageName, routePath] of [
      ['@nocobase/app-plugin-users', '/users'],
      ['@nocobase/app-plugin-api-keys', '/api-keys'],
    ]) {
      const plugin = clientPlugins.plugins.find(
        (entry) => entry.packageName === packageName,
      );
      expect(plugin?.routes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            parent: 'settings',
            routes: expect.arrayContaining([
              expect.objectContaining({ path: routePath }),
            ]),
          }),
        ]),
      );
    }
  });

  it('registers no package twice', () => {
    expect(new Set(registeredClientPackages).size).toBe(
      registeredClientPackages.length,
    );
  });
});
