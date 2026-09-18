import { beforeEach, expect, it, vi } from 'vitest';
import type { DatabaseConnection } from '../../../src/database/connection.js';
import type { DatabaseDriverRegistration } from '../../../src/database/config.js';
import { DefaultDatabaseManager } from '../../../src/database/manager.js';
import { resolveDatabaseDriver } from '../../../src/database/resolve-driver.js';

const loader = vi.hoisted(() => ({ resolve: vi.fn(), load: vi.fn() }));
vi.mock('node:module', async (original) => {
  const module = await original<typeof import('node:module')>();
  return {
    ...module,
    createRequire: (url: string | URL) =>
      String(url).endsWith('/database/resolve-driver.ts')
        ? Object.assign(loader.load, { resolve: loader.resolve })
        : module.createRequire(url),
  };
});

beforeEach(() => {
  vi.resetAllMocks();
  loader.resolve.mockImplementation((name: string) => `/installed/${name}`);
  loader.load.mockReturnValue({ default: { dialect: 'mysql' } });
});

it('does not inspect drivers until a connection is requested, and reuses connections', () => {
  const create = vi.fn(
    ({ name }: { name: string }) => ({ name }) as DatabaseConnection,
  );
  const database = new DefaultDatabaseManager(
    {
      connections: {
        main: { dialect: 'mysql' },
        unused: { dialect: 'sqlite' },
      },
    },
    { create },
  );
  expect(loader.resolve).not.toHaveBeenCalled();
  expect(loader.load).not.toHaveBeenCalled();
  const main = database.connection('main');
  expect(database.connection('main')).toBe(main);
  expect(loader.resolve).toHaveBeenCalledExactlyOnceWith('@nocobase/db-mysql');
  expect(loader.load).toHaveBeenCalledExactlyOnceWith(
    '/installed/@nocobase/db-mysql',
  );
  expect(create).toHaveBeenCalledOnce();
  expect(create.mock.calls[0][0]).toMatchObject({
    config: { databaseDriver: { dialect: 'mysql' } },
  });
});

it('preserves explicit factories, descriptors and supplied drivers without loading peers', () => {
  const descriptor = { dialect: 'mysql' };
  const factory = Object.assign(
    () => ({ dialect: 'mysql', databaseDriver: descriptor }),
    {
      dialect: 'mysql',
      driver: descriptor,
    },
  );
  expect(resolveDatabaseDriver({ dialect: 'mysql' }, { mysql: factory })).toBe(
    descriptor,
  );
  expect(
    resolveDatabaseDriver({ dialect: 'mysql' }, { mysql: descriptor }),
  ).toBe(descriptor);
  expect(
    resolveDatabaseDriver({ dialect: 'mysql', databaseDriver: descriptor }),
  ).toBe(descriptor);
  expect(loader.load).not.toHaveBeenCalled();
  expect(loader.resolve).not.toHaveBeenCalled();
});

it('does not fall back when an explicit registration is invalid or conflicts', () => {
  expect(() =>
    resolveDatabaseDriver(
      { dialect: 'mysql' },
      { mysql: { dialect: 'postgres' } },
    ),
  ).toThrow('points to dialect "postgres"');
  expect(() =>
    resolveDatabaseDriver(
      { dialect: 'mysql', databaseDriver: { dialect: 'mysql' } },
      { mysql: { dialect: 'mysql' } },
    ),
  ).toThrow('conflicts');
  expect(() =>
    resolveDatabaseDriver(
      { dialect: 'mysql' },
      { mysql: null as unknown as DatabaseDriverRegistration },
    ),
  ).toThrow('Invalid database driver');
  expect(loader.resolve).not.toHaveBeenCalled();
});

it('does not turn unknown dialects or inherited keys into package names', () => {
  for (const dialect of [
    'custom',
    'constructor',
    '__proto__',
    '../../example',
  ]) {
    expect(resolveDatabaseDriver({ dialect })).toBeUndefined();
  }
  expect(loader.resolve).not.toHaveBeenCalled();
});

it('reports missing peers separately from errors inside installed packages', () => {
  const missing = Object.assign(new Error('missing'), {
    code: 'MODULE_NOT_FOUND',
  });
  loader.resolve.mockImplementation(() => {
    throw missing;
  });
  expect(() =>
    resolveDatabaseDriver({ dialect: 'mysql' }, undefined, 'reporting'),
  ).toThrow('pnpm add @nocobase/db-mysql');
  expect(loader.load).not.toHaveBeenCalled();
  loader.resolve.mockReturnValue('/installed/mysql');
  loader.load.mockImplementation(() => {
    throw missing;
  });
  try {
    resolveDatabaseDriver({ dialect: 'mysql' }, undefined, 'reporting');
    expect.fail('Expected the installed driver to fail');
  } catch (error) {
    expect(error).toMatchObject({
      message:
        'Failed to load database driver "@nocobase/db-mysql" for connection "reporting".',
      cause: missing,
    });
  }
});

it('validates the default export and its dialect', () => {
  loader.load.mockReturnValue({});
  expect(() => resolveDatabaseDriver({ dialect: 'mysql' })).toThrow(
    'must have a default export',
  );
  loader.load.mockReturnValue({ default: { dialect: 'postgres' } });
  expect(() => resolveDatabaseDriver({ dialect: 'mysql' })).toThrow(
    'points to dialect "postgres"',
  );
});
