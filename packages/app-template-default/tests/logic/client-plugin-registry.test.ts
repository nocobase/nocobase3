// @vitest-environment node

// Client extensions are registered in client/plugins.ts, while nocobase.plugins
// still drives the server bootstrap, database task sources, dev watch paths and
// the build filter. Nothing at runtime reconciles the two, so a plugin can end
// up loading on one side and not the other. These tests are that reconciliation.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import clientPlugins from '../../client/plugins.js';

const appRoot = fileURLToPath(new URL('../..', import.meta.url));

interface AppPackageJson {
  readonly nocobase?: {
    readonly plugins?: Record<string, { readonly enabled?: boolean }>;
  };
  readonly devDependencies?: Record<string, string>;
}

const appPackage = JSON.parse(
  readFileSync(path.join(appRoot, 'package.json'), 'utf8'),
) as AppPackageJson;

const registry = appPackage.nocobase?.plugins ?? {};
const registeredClientPackages = clientPlugins.plugins.map(
  (plugin) => plugin.packageName,
);

describe('client plugin registry consistency', () => {
  it('registers every client plugin in nocobase.plugins as enabled', () => {
    const missing = registeredClientPackages.filter(
      (packageName) => registry[packageName]?.enabled !== true,
    );

    expect(missing).toEqual([]);
  });

  it('declares every client plugin as a dependency', () => {
    const undeclared = registeredClientPackages.filter(
      (packageName) => appPackage.devDependencies?.[packageName] === undefined,
    );

    expect(undeclared).toEqual([]);
  });

  it('registers no package twice', () => {
    expect(new Set(registeredClientPackages).size).toBe(
      registeredClientPackages.length,
    );
  });

  it('wires every enabled plugin that ships a client entry', async () => {
    const enabled = Object.entries(registry)
      .filter(([, registration]) => registration.enabled === true)
      .map(([packageName]) => packageName);
    const shipsClientEntry = await Promise.all(
      enabled.map(async (packageName) => {
        try {
          await import(`${packageName}/client/plugin`);
          return packageName;
        } catch {
          return undefined;
        }
      }),
    );
    const unwired = shipsClientEntry
      .filter((packageName) => packageName !== undefined)
      .filter((packageName) => !registeredClientPackages.includes(packageName));

    expect(unwired).toEqual([]);
  });
});
