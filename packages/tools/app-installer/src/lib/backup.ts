import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Layout } from './layout.ts';

/** Where the Hub template keeps its SQLite database, relative to `HUB_STORAGE_DIR`. */
export const HUB_DATABASE = 'hub/database/main.sqlite';

/** A SQLite database is the main file plus whichever journal files exist beside it. */
const SQLITE_SUFFIXES = ['', '-wal', '-shm', '-journal'];

/** UTC, so backups taken on machines in different time zones sort the same way. */
function stamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

export function backupName(from: string, to: string, date: Date): string {
  return `${stamp(date)}_${from}_to_${to}`;
}

async function existingDatabaseFiles(directory: string): Promise<string[]> {
  const base = path.basename(HUB_DATABASE);
  const present = new Set(await readdir(directory).catch(() => [] as string[]));
  return SQLITE_SUFFIXES.map((suffix) => `${base}${suffix}`).filter((name) =>
    present.has(name),
  );
}

/**
 * Whether a backup holds a database that can be restored. An upgrade of a Hub on an external database backs up only
 * `config.yml` and `hub.env`, and a backup interrupted before its copy finished may hold nothing.
 */
export function backupHasDatabase(
  layout: Layout,
  backupRelative: string,
): boolean {
  return existsSync(
    path.join(layout.root, backupRelative, path.basename(HUB_DATABASE)),
  );
}

export async function removeBackup(
  layout: Layout,
  backupRelative: string,
): Promise<void> {
  await rm(path.join(layout.root, backupRelative), {
    recursive: true,
    force: true,
  });
}

export interface BackupResult {
  /** Relative to the root, as recorded in `installer.json`. */
  relative: string;
  databaseFiles: string[];
}

/**
 * Copies the Hub's SQLite database, `config.yml` and `hub.env` while the Hub is stopped, so the files are consistent.
 * This is what a failed upgrade restores; it is not a backup of hosted applications, which an upgrade of the Hub does
 * not migrate.
 */
export async function backupForUpgrade(
  layout: Layout,
  name: string,
  withDatabase: boolean,
): Promise<BackupResult> {
  const target = path.join(layout.backupsDir, name);
  await mkdir(target, { recursive: true });
  await copyFile(layout.configFile, path.join(target, 'config.yml'));
  await copyFile(layout.hubEnv, path.join(target, 'hub.env'));
  let databaseFiles: string[] = [];
  if (withDatabase) {
    const source = path.dirname(path.join(layout.storageDir, HUB_DATABASE));
    databaseFiles = await existingDatabaseFiles(source);
    for (const file of databaseFiles) {
      await copyFile(path.join(source, file), path.join(target, file));
    }
  }
  return { relative: path.relative(layout.root, target), databaseFiles };
}

/**
 * Puts a backed-up database back. Journal files that exist now but were not in the backup are removed, since SQLite
 * would otherwise replay a newer write-ahead log onto the older database.
 */
export async function restoreDatabase(
  layout: Layout,
  backupRelative: string,
): Promise<string[]> {
  const source = path.join(layout.root, backupRelative);
  const files = await existingDatabaseFiles(source);
  if (!files.includes(path.basename(HUB_DATABASE))) {
    throw new Error(`${source} holds no ${path.basename(HUB_DATABASE)}.`);
  }
  const target = path.dirname(path.join(layout.storageDir, HUB_DATABASE));
  for (const leftover of await existingDatabaseFiles(target)) {
    if (!files.includes(leftover)) {
      await rm(path.join(target, leftover), { force: true });
    }
  }
  for (const file of files) {
    await copyFile(path.join(source, file), path.join(target, file));
  }
  return files;
}
