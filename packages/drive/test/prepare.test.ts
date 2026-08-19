import { mkdtemp, readlink, rm } from 'node:fs/promises';
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
  it('creates local drive roots and configured links', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'nocobase-drive-'));
    tempDirs.push(root);

    const config = createConfig(root);
    const result = await prepareDriveStorage(config);

    expect(existsSync(path.join(root, 'storage/app/private'))).toBe(true);
    expect(existsSync(path.join(root, 'storage/app/public'))).toBe(true);
    expect(await readlink(path.join(root, 'public/storage'))).toBe('../storage/app/public');
    expect(result.links).toEqual([
      {
        link: path.join(root, 'public/storage'),
        target: path.join(root, 'storage/app/public'),
        status: 'created',
      },
    ]);
  });

  it('can skip link creation', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'nocobase-drive-'));
    tempDirs.push(root);

    const config = createConfig(root);
    const result = await prepareDriveStorage(config, { createLinks: false });

    expect(existsSync(path.join(root, 'storage/app/private'))).toBe(true);
    expect(existsSync(path.join(root, 'storage/app/public'))).toBe(true);
    expect(existsSync(path.join(root, 'public/storage'))).toBe(false);
    expect(result.links[0]).toMatchObject({
      link: path.join(root, 'public/storage'),
      target: path.join(root, 'storage/app/public'),
      status: 'skipped',
    });
  });
});

function createConfig(root: string): AppDriveConfig {
  return {
    default: 'local',
    disks: {
      local: {
        driver: 'fs',
        location: path.join(root, 'storage/app/private'),
        visibility: 'private',
      },
      public: {
        driver: 'fs',
        location: path.join(root, 'storage/app/public'),
        visibility: 'public',
        url: '/storage',
      },
    },
    links: {
      [path.join(root, 'public/storage')]: path.join(root, 'storage/app/public'),
    },
  };
}
