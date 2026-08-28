import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { ServiceContainer } from '@nocobase/service-provider';

import {
  DriveProvider,
  driveManagerToken,
  type AppDriveConfig,
} from '../src/index.js';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const directory of tempDirs.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe('DriveProvider', () => {
  it('registers the configured drive and prepares its storage', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'nocobase-drive-provider-'));
    const location = path.join(root, 'storage');
    const container = new ServiceContainer();
    const drive: AppDriveConfig = {
      default: 'local',
      disks: {
        local: {
          driver: 'fs',
          location,
          visibility: 'private',
        },
      },
      links: {},
    };
    tempDirs.push(root);
    const provider = new DriveProvider({
      config: { drive },
      container,
    });

    provider.register();
    await provider.boot();

    expect(provider.name).toBe('@nocobase/drive');
    expect(container.resolve(driveManagerToken)).toBeDefined();
  });

  it('does not register a manager without drive configuration', async () => {
    const container = new ServiceContainer();
    const provider = new DriveProvider({
      config: {},
      container,
    });

    provider.register();
    await provider.boot();

    expect(container.has(driveManagerToken)).toBe(false);
  });
});
