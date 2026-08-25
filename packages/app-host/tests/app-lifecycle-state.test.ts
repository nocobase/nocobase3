import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AppLifecycleStateStore,
  parseAppLifecycleState,
} from '../dist/index.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe('AppLifecycleStateStore', () => {
  it('persists desired state idempotently', async () => {
    const stateDir = await mkdtemp(
      path.join(os.tmpdir(), 'nocobase-app-lifecycle-state-'),
    );
    tempDirs.push(stateDir);
    let now = new Date('2026-08-25T01:00:00.000Z');
    const store = new AppLifecycleStateStore({
      stateDir,
      now: () => now,
    });

    const stopped = await store.setDesiredState('orders', 'stopped');
    now = new Date('2026-08-25T02:00:00.000Z');
    const repeated = await store.setDesiredState('orders', 'stopped');

    expect(repeated).toEqual(stopped);
    await expect(store.read()).resolves.toEqual({
      schemaVersion: 1,
      apps: [stopped],
    });
    expect(JSON.parse(await readFile(store.stateFile, 'utf8'))).toEqual({
      schemaVersion: 1,
      apps: [stopped],
    });
  });

  it('rejects unknown fields and unsafe app IDs', () => {
    expect(() =>
      parseAppLifecycleState(
        JSON.stringify({
          schemaVersion: 1,
          apps: [
            {
              appId: '../orders',
              desiredState: 'stopped',
              updatedAt: '2026-08-25T01:00:00.000Z',
              extra: true,
            },
          ],
        }),
      ),
    ).toThrow();
  });
});
