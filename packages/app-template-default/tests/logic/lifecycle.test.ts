import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppRuntime } from '@nocobase/app-server-kit/runtime';

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
const runConfiguredAppSeedsMock = vi.hoisted(() =>
  vi.fn(async () => {
    calls.push('seed');
  }),
);
vi.mock('@nocobase/app-server-kit/database', () => ({
  prepareAppDatabaseStorage: prepareAppDatabaseStorageMock,
}));
vi.mock('@nocobase/app-server-kit/runtime', () => ({
  runConfiguredAppMigrations: runConfiguredAppMigrationsMock,
  runConfiguredAppSeeds: runConfiguredAppSeedsMock,
}));
import { prepareAppRuntime } from '../../server/runtime/lifecycle.ts';

beforeEach(() => {
  calls.length = 0;
  prepareAppDatabaseStorageMock.mockClear();
  runConfiguredAppMigrationsMock.mockReset().mockImplementation(async () => {
    calls.push('migrate');
  });
  runConfiguredAppSeedsMock.mockReset().mockImplementation(async () => {
    calls.push('seed');
  });
});

describe('app runtime preparation', () => {
  it('runs configured migrations before seeds', async () => {
    await prepareAppRuntime(createRuntime());

    expect(calls).toEqual(['prepare-database', 'migrate', 'seed']);
    expect(prepareAppDatabaseStorageMock).toHaveBeenCalledOnce();
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
    },
  } as AppRuntime<AppConfig>;
}
