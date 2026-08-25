import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppRuntime } from '@nocobase/app-server/runtime';

import type { AppConfig } from '../../server/config/index.ts';

const calls: string[] = [];
const prepareAppDatabaseStorageMock = vi.hoisted(() =>
  vi.fn(async () => {
    calls.push('prepare-database');
  }),
);
const runMigrationsMock = vi.hoisted(() =>
  vi.fn(async () => {
    calls.push('migrate');
  }),
);
const restoreMetadataMock = vi.hoisted(() =>
  vi.fn(async () => {
    calls.push('restore-metadata');
  }),
);
const runSeedsMock = vi.hoisted(() =>
  vi.fn(async () => {
    calls.push('seed');
  }),
);
vi.mock('@nocobase/app-server/database', () => ({
  prepareAppDatabaseStorage: prepareAppDatabaseStorageMock,
}));

import { prepareAppRuntime } from '../../server/runtime/lifecycle.ts';

beforeEach(() => {
  calls.length = 0;
  prepareAppDatabaseStorageMock.mockClear();
  runMigrationsMock.mockReset().mockImplementation(async () => {
    calls.push('migrate');
  });
  runSeedsMock.mockReset().mockImplementation(async () => {
    calls.push('seed');
  });
  restoreMetadataMock.mockClear();
});

describe('app runtime preparation', () => {
  it('runs self-contained migrations before seeds when auto-run is enabled', async () => {
    await prepareAppRuntime(createRuntime(true, true));

    expect(calls).toEqual(['prepare-database', 'migrate', 'seed']);
    expect(prepareAppDatabaseStorageMock).toHaveBeenCalledOnce();
    expect(restoreMetadataMock).not.toHaveBeenCalled();
  });

  it('only restores metadata when migration auto-run is disabled', async () => {
    await prepareAppRuntime(createRuntime(false, false));

    expect(calls).toEqual(['prepare-database', 'restore-metadata']);
    expect(runMigrationsMock).not.toHaveBeenCalled();
    expect(runSeedsMock).not.toHaveBeenCalled();
  });

  it('does not run seeds when migrations fail', async () => {
    const error = new Error('migration failed');
    runMigrationsMock.mockRejectedValueOnce(error);

    await expect(prepareAppRuntime(createRuntime(true, true))).rejects.toBe(
      error,
    );
    expect(runSeedsMock).not.toHaveBeenCalled();
  });
});

function createRuntime(
  migrationsAutoRun: boolean,
  seedsAutoRun: boolean,
): AppRuntime<AppConfig> {
  return {
    config: {
      database: {
        migrations: {
          autoRun: migrationsAutoRun,
        },
        seeds: {
          autoRun: seedsAutoRun,
        },
      },
      plugins: [
        {
          packageName: '@nocobase/app-plugin-files',
          enabled: true,
        },
      ],
    },
    database: {},
    restoreMetadata: restoreMetadataMock,
    runMigrations: runMigrationsMock,
    runSeeds: runSeedsMock,
  } as AppRuntime<AppConfig>;
}
