import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppRuntime } from '@nocobase/app-server/runtime';

import type { AppConfig } from '../../server/config/index.ts';

const calls: string[] = [];
const prepareAppDatabaseStorageMock = vi.hoisted(() =>
  vi.fn(async () => {
    calls.push('prepare-database');
  }),
);
const prepareDriveStorageMock = vi.hoisted(() =>
  vi.fn(async () => {
    calls.push('prepare-drive');
  }),
);
const runConfiguredAppMigrationsMock = vi.hoisted(() =>
  vi.fn(async () => {
    calls.push('migrate');
  }),
);
const runConfiguredAppSeedsMock = vi.hoisted(() =>
  vi.fn(async () => {
    calls.push('seed');
  }),
);

vi.mock('@nocobase/app-server/database', () => ({
  prepareAppDatabaseStorage: prepareAppDatabaseStorageMock,
}));

vi.mock('@nocobase/app-server/runtime', () => ({
  runConfiguredAppMigrations: runConfiguredAppMigrationsMock,
  runConfiguredAppSeeds: runConfiguredAppSeedsMock,
}));

vi.mock('@nocobase/drive', () => ({
  prepareDriveStorage: prepareDriveStorageMock,
}));

import { prepareAppRuntime } from '../../server/runtime/lifecycle.ts';

beforeEach(() => {
  calls.length = 0;
  prepareAppDatabaseStorageMock.mockClear();
  prepareDriveStorageMock.mockClear();
  runConfiguredAppMigrationsMock.mockClear();
  runConfiguredAppSeedsMock.mockClear();
});

describe('app runtime preparation', () => {
  it('runs migrations before seeds', async () => {
    await prepareAppRuntime(createRuntime());

    expect(calls).toEqual([
      'prepare-database',
      'prepare-drive',
      'migrate',
      'seed',
    ]);
  });

  it('does not run seeds when migrations fail', async () => {
    const error = new Error('migration failed');
    runConfiguredAppMigrationsMock.mockRejectedValueOnce(error);

    await expect(prepareAppRuntime(createRuntime())).rejects.toBe(error);
    expect(runConfiguredAppSeedsMock).not.toHaveBeenCalled();
  });
});

function createRuntime(): AppRuntime<AppConfig> {
  return {
    config: {
      database: {},
      drive: {},
    },
  } as AppRuntime<AppConfig>;
}
