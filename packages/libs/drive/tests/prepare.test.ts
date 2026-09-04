import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { prepareDriveStorage, type AppDriveConfig } from '../src/index.js';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe('prepareDriveStorage', () => {
  it('creates configured filesystem disk roots', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'nocobase-drive-'));
    tempDirs.push(root);

    const config = createConfig(root);
    const result = await prepareDriveStorage(config);

    expect(existsSync(path.join(root, 'storage'))).toBe(true);
    expect(result.directories).toEqual([path.join(root, 'storage')]);
  });
});

function createConfig(root: string): AppDriveConfig {
  return {
    default: 'local',
    disks: {
      local: {
        driver: 'fs',
        location: path.join(root, 'storage'),
        visibility: 'private',
      },
    },
  };
}
