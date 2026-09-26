import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupFor, defaultRollbackTarget } from '../src/commands/rollback.ts';
import { assertNoPending, releasesToPrune } from '../src/commands/upgrade.ts';
import {
  backupForUpgrade,
  backupName,
  HUB_DATABASE,
  restoreDatabase,
} from '../src/lib/backup.ts';
import { confirm } from '../src/lib/confirm.ts';
import { layoutOf } from '../src/lib/layout.ts';
import type { InstallerState, ReleaseRecord } from '../src/lib/state.ts';

const target = { platform: 'linux', arch: 'x64', nodeMajor: 24 };

function release(version: string, installedAt: string): ReleaseRecord {
  return { version, installedAt, buildTarget: target };
}

function state(overrides: Partial<InstallerState> = {}): InstallerState {
  return {
    schemaVersion: 1,
    name: 'nocobase-hub',
    registry: 'https://npm.nocobase.ai',
    dialect: 'sqlite',
    drivers: [],
    current: '3.0.0',
    releases: [],
    history: [],
    ...overrides,
  };
}

describe('releasesToPrune', () => {
  const releases = [
    release('1.0.0', '2026-01-01T00:00:00.000Z'),
    release('2.0.0', '2026-02-01T00:00:00.000Z'),
    release('3.0.0', '2026-03-01T00:00:00.000Z'),
    release('4.0.0', '2026-04-01T00:00:00.000Z'),
  ];

  it('keeps the newest releases and the current one', () => {
    expect(releasesToPrune(releases, '4.0.0', 3).map((r) => r.version)).toEqual(
      ['1.0.0'],
    );
  });

  it('never prunes the current release, even when it is the oldest', () => {
    expect(releasesToPrune(releases, '1.0.0', 2).map((r) => r.version)).toEqual(
      ['2.0.0', '3.0.0'],
    );
  });

  it('prunes nothing while there is room', () => {
    expect(releasesToPrune(releases, '4.0.0', 10)).toEqual([]);
  });
});

describe('rollback target', () => {
  it('returns to where the last completed upgrade came from', () => {
    const s = state({
      history: [
        { action: 'install', to: '1.0.0', at: 'a' },
        {
          action: 'upgrade',
          from: '1.0.0',
          to: '2.0.0',
          at: 'b',
          outcome: 'completed',
        },
        {
          action: 'upgrade',
          from: '2.0.0',
          to: '3.0.0',
          at: 'c',
          outcome: 'completed',
          migrations: 2,
          backup: 'backups/x',
        },
        {
          action: 'upgrade',
          from: '3.0.0',
          to: '4.0.0',
          at: 'd',
          outcome: 'rolled-back',
        },
      ],
    });
    expect(defaultRollbackTarget(s)).toBe('2.0.0');
    expect(backupFor(s, '2.0.0')).toEqual({
      backup: 'backups/x',
      migrated: true,
    });
  });

  it('leaves the database alone when the upgrade applied no migrations', () => {
    const s = state({
      history: [
        {
          action: 'upgrade',
          from: '2.0.0',
          to: '3.0.0',
          at: 'c',
          outcome: 'completed',
          migrations: 0,
          backup: 'backups/x',
        },
      ],
    });
    expect(backupFor(s, '2.0.0')).toEqual({
      backup: 'backups/x',
      migrated: false,
    });
  });

  it('undoes an interrupted upgrade and finishes an interrupted rollback', () => {
    const upgrading = state({
      pending: {
        action: 'upgrade',
        from: '3.0.0',
        to: '4.0.0',
        startedAt: 'x',
        backup: 'backups/y',
      },
    });
    expect(defaultRollbackTarget(upgrading)).toBe('3.0.0');
    // How far it got is unknown, so the database is treated as migrated.
    expect(backupFor(upgrading, '3.0.0')).toEqual({
      backup: 'backups/y',
      migrated: true,
    });

    const rollingBack = state({
      pending: {
        action: 'rollback',
        from: '3.0.0',
        to: '2.0.0',
        startedAt: 'x',
      },
    });
    expect(defaultRollbackTarget(rollingBack)).toBe('2.0.0');
  });

  it('has nothing to return to on a fresh install', () => {
    expect(
      defaultRollbackTarget(
        state({ history: [{ action: 'install', to: '3.0.0', at: 'a' }] }),
      ),
    ).toBeUndefined();
  });

  it('refuses to stack an operation on an interrupted one', () => {
    expect(() =>
      assertNoPending(
        state({
          pending: {
            action: 'upgrade',
            from: '3.0.0',
            to: '4.0.0',
            startedAt: 'x',
          },
        }),
      ),
    ).toThrow(/did not finish/);
    expect(() => assertNoPending(state())).not.toThrow();
  });
});

describe('backup and restore', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'hub-installer-backup-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('names a backup after the time and both versions', () => {
    expect(backupName('1.0.0', '1.1.0', new Date(2026, 8, 26, 3, 4, 5))).toBe(
      '20260926-030405_1.0.0_to_1.1.0',
    );
  });

  it('copies the database with its journal and restores it, dropping a newer journal', async () => {
    const layout = layoutOf(root);
    const database = path.join(layout.storageDir, HUB_DATABASE);
    await mkdir(path.dirname(database), { recursive: true });
    await writeFile(layout.configFile, 'config');
    await writeFile(layout.hubEnv, 'env');
    await writeFile(database, 'before');

    const backup = await backupForUpgrade(layout, 'b1', true);
    expect(backup.relative).toBe(path.join('backups', 'b1'));
    expect(backup.databaseFiles).toEqual(['main.sqlite']);
    expect((await readdir(path.join(root, backup.relative))).sort()).toEqual([
      'config.yml',
      'hub.env',
      'main.sqlite',
    ]);

    // The failed upgrade migrated and left a write-ahead log behind.
    await writeFile(database, 'after');
    await writeFile(`${database}-wal`, 'newer writes');

    expect(await restoreDatabase(layout, backup.relative)).toEqual([
      'main.sqlite',
    ]);
    expect(await readFile(database, 'utf8')).toBe('before');
    await expect(readFile(`${database}-wal`, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('backs up only the configuration for an external database', async () => {
    const layout = layoutOf(root);
    await writeFile(layout.configFile, 'config');
    await writeFile(layout.hubEnv, 'env');
    const backup = await backupForUpgrade(layout, 'b2', false);
    expect(backup.databaseFiles).toEqual([]);
    await expect(restoreDatabase(layout, backup.relative)).rejects.toThrow(
      /main\.sqlite/,
    );
  });
});

describe('confirm', () => {
  it('passes straight through with --yes', async () => {
    await expect(
      confirm(['Upgrade?'], { yes: true, json: true }),
    ).resolves.toBeUndefined();
  });

  it('refuses to guess under --json or without a terminal', async () => {
    const input = Object.assign(new PassThrough(), { isTTY: false });
    await expect(
      confirm(['Upgrade?', 'The Hub stops.'], {
        yes: false,
        json: false,
        input,
      }),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED', exitCode: 2 });
    await expect(
      confirm(['Upgrade?'], { yes: false, json: true }),
    ).rejects.toMatchObject({
      code: 'CONFIRMATION_REQUIRED',
    });
  });

  it('asks on a terminal and cancels on anything but yes', async () => {
    const answer = async (text: string) => {
      const input = Object.assign(new PassThrough(), { isTTY: true });
      const output = new PassThrough();
      const pending = confirm(['Upgrade?'], {
        yes: false,
        json: false,
        input,
        output,
      });
      input.write(`${text}\n`);
      return pending;
    };
    await expect(answer('y')).resolves.toBeUndefined();
    await expect(answer('n')).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});
