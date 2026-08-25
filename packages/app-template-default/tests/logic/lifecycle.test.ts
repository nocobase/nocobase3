import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppRuntime } from '@nocobase/app-server/runtime';

import type { AppConfig } from '../../server/config/index.ts';

const calls: string[] = [];
const prepareAppDatabaseStorageMock = vi.hoisted(() =>
  vi.fn(async () => {
    calls.push('prepare-database');
  }),
);
const runConfiguredAppMigrationsMock = vi.hoisted(() =>
  vi.fn(async () => {
    calls.push('migrate');
  }),
);
const restoreMetadataMock = vi.hoisted(() =>
  vi.fn(async () => {
    calls.push('restore-metadata');
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

import { prepareAppRuntime } from '../../server/runtime/lifecycle.ts';

beforeEach(() => {
  calls.length = 0;
  prepareAppDatabaseStorageMock.mockClear();
  runConfiguredAppMigrationsMock.mockClear();
  runConfiguredAppSeedsMock.mockClear();
  restoreMetadataMock.mockClear();
});

describe('app runtime preparation', () => {
  it('runs migrations before seeds', async () => {
    await prepareAppRuntime(createRuntime());

    expect(calls).toEqual([
      'prepare-database',
      'restore-metadata',
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
      plugins: [
        {
          packageName: '@nocobase/app-plugin-files',
          enabled: true,
        },
      ],
    },
    database: {},
    restoreMetadata: restoreMetadataMock,
  } as AppRuntime<AppConfig>;
}
