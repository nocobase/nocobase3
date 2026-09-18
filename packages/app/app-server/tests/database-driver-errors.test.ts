import { expect, it, vi } from 'vitest';
import { createAppDatabaseManager } from '../src/database/manager.js';
import { validateDatabaseOwnership } from '../src/database/ownership.js';
import { prepareAppDatabaseStorage } from '../src/database/storage.js';

vi.mock('node:module', async (original) => {
  const module = await original<typeof import('node:module')>();
  return {
    ...module,
    createRequire: (url: string | URL) => {
      const require = module.createRequire(url);
      if (!String(url).endsWith('/database/resolve-driver.ts')) return require;
      return Object.assign((id: string) => require(id), {
        resolve: (id: string) => {
          if (id === '@nocobase/db-mysql') {
            throw Object.assign(new Error('Missing test driver'), {
              code: 'MODULE_NOT_FOUND',
            });
          }
          return require.resolve(id);
        },
      });
    },
  };
});

const config = {
  connections: {
    main: { dialect: 'custom', databaseDriver: { dialect: 'custom' } },
    reporting: { dialect: 'mysql', database: 'reports' },
  },
};
const message =
  'Database connection "reporting" requires "@nocobase/db-mysql". Install it with "pnpm add @nocobase/db-mysql".';

it('identifies the configured connection when normalization cannot load its driver', () => {
  expect(() => createAppDatabaseManager(config)).toThrow(message);
});

it('identifies the configured connection during ownership validation', () => {
  expect(() => validateDatabaseOwnership(config)).toThrow(message);
});

it('identifies the configured connection during storage preparation', async () => {
  await expect(prepareAppDatabaseStorage(config)).rejects.toThrow(message);
});
