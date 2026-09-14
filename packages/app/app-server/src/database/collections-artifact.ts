import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
  assertCollectionArtifactDirectoryNames,
  COLLECTION_ARTIFACT_FILE_NAMES,
  COLLECTION_ARTIFACT_MANIFEST_FILE_NAME,
  serializeCollectionArtifact,
  serializeCollectionArtifactManifest,
  type CollectionArtifactFileKind,
  type DatabaseConnection,
  type DatabaseDriverRegistration,
  type DatabaseManager,
} from '@nocobase/db';

import type { ConfigPaths } from '../config/index.js';
import { createAppDatabaseManager } from './manager.js';
import { defaultConnectionName, planAppDatabaseTasks } from './plan.js';
import type { AppDatabaseConfig } from './types.js';

/**
 * Reads every Collection a connection resolves and writes it under
 * `database/<connection>/collections/<name>/` as three files, plus a
 * connection-level manifest. The files are derived: nothing here is read
 * back at runtime, and migrations remain the only authority on schema.
 * See `internal-docs/app-collections-artifact-design.md`.
 */
export interface AppCollectionsArtifactOptions {
  readonly paths?: ConfigPaths;
  readonly drivers?: Record<string, DatabaseDriverRegistration>;
  /** One connection; defaults to the default connection. Exclusive with `all`. */
  readonly connection?: string;
  /** Every managed connection; external connections are reported as skipped. */
  readonly all?: boolean;
  /** Compare the generated result with the files on disk and write nothing. */
  readonly check?: boolean;
  /** Reuse an open manager instead of creating and destroying one. */
  readonly database?: DatabaseManager;
}

export type AppCollectionsArtifactDifferenceKind =
  'missing' | 'stale' | 'unexpected';

/** One file that differs between the database and the directory; `path` is relative to the collections directory. */
export interface AppCollectionsArtifactDifference {
  path: string;
  kind: AppCollectionsArtifactDifferenceKind;
}

export interface AppCollectionsArtifactManifestSummary {
  dialect: string;
  migrationHead: string | null;
  collections: string[];
}

export interface AppCollectionsArtifactConnectionResult {
  connection: string;
  /** Absolute path of `database/<connection>/collections`. */
  directory: string;
  status: 'completed' | 'skipped' | 'stale' | 'failed';
  reason?: 'external';
  manifest?: AppCollectionsArtifactManifestSummary;
  /** Files created or rewritten, relative to `directory`. Empty in check mode. */
  written?: string[];
  /** Files removed because their Collection no longer exists. Empty in check mode. */
  deleted?: string[];
  /** Collections whose three files already matched. */
  unchanged?: number;
  /** Check mode only. */
  differences?: AppCollectionsArtifactDifference[];
  error?: string;
}

export interface AppCollectionsArtifactResult {
  ok: boolean;
  status: 'completed' | 'stale' | 'failed' | 'not-configured';
  check: boolean;
  results: AppCollectionsArtifactConnectionResult[];
}

const STAGING_PREFIX = '.staging-';
const FILE_KINDS: readonly CollectionArtifactFileKind[] = [
  'collection',
  'metadata',
  'schema',
];
const FILE_NAME_KINDS: ReadonlyMap<string, CollectionArtifactFileKind> =
  new Map(
    FILE_KINDS.map((kind) => [COLLECTION_ARTIFACT_FILE_NAMES[kind], kind]),
  );

export async function generateAppCollectionsArtifact(
  config: AppDatabaseConfig,
  options: AppCollectionsArtifactOptions = {},
): Promise<AppCollectionsArtifactResult> {
  const check = options.check ?? false;
  const names = selectConnections(config, options);
  if (names === undefined) {
    return { ok: true, status: 'not-configured', check, results: [] };
  }
  const database =
    options.database ??
    createAppDatabaseManager(config, options.paths, options.drivers);
  if (!database) {
    return { ok: true, status: 'not-configured', check, results: [] };
  }
  const migrationTables = migrationTableNames(config, options);
  const root = options.paths?.database() ?? path.resolve('database');
  const results: AppCollectionsArtifactConnectionResult[] = [];
  try {
    for (const name of names) {
      const directory = path.join(root, name, 'collections');
      if (config.connections[name].schemaManagement === 'external') {
        results.push({
          connection: name,
          directory,
          status: 'skipped',
          reason: 'external',
        });
        continue;
      }
      try {
        results.push(
          await generateForConnection(database.connection(name), directory, {
            check,
            migrationHead: () =>
              readMigrationHead(database, name, migrationTables.get(name)),
          }),
        );
      } catch (error) {
        results.push({
          connection: name,
          directory,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    if (!options.database) await database.destroy();
  }
  const status = results.some((entry) => entry.status === 'failed')
    ? 'failed'
    : results.some((entry) => entry.status === 'stale')
      ? 'stale'
      : 'completed';
  return { ok: status === 'completed', status, check, results };
}

/** Mirrors the selection rules of `planAppDatabaseTasks` so the two commands read the same flags the same way. */
function selectConnections(
  config: AppDatabaseConfig,
  options: AppCollectionsArtifactOptions,
): string[] | undefined {
  if (options.connection !== undefined && options.all) {
    throw new Error('--connection and --all are mutually exclusive.');
  }
  const primary = defaultConnectionName(config);
  if (primary === 'none' || !primary) {
    if (options.connection !== undefined) {
      throw new Error('Database is not configured.');
    }
    return undefined;
  }
  const names = options.all
    ? Object.keys(config.connections).sort((a, b) =>
        a === primary ? -1 : b === primary ? 1 : a < b ? -1 : a > b ? 1 : 0,
      )
    : [options.connection ?? primary];
  for (const name of names) {
    if (!Object.hasOwn(config.connections, name)) {
      throw new Error(`Unknown database connection "${name}".`);
    }
    if (
      !options.all &&
      config.connections[name].schemaManagement === 'external'
    ) {
      throw new Error(
        `Database connection "${name}" is external; Collection artifacts are generated for managed connections only.`,
      );
    }
  }
  return names;
}

/**
 * The history table name is part of a connection's migration configuration,
 * which planning already resolves — including the legacy top-level form. Ask
 * the planner rather than duplicating that resolution here.
 */
function migrationTableNames(
  config: AppDatabaseConfig,
  options: AppCollectionsArtifactOptions,
): Map<string, string | undefined> {
  const tasks = planAppDatabaseTasks(config, ['migrations'], {
    contributions: { appPackageName: 'app', migrations: [], seeds: [] },
    paths: options.paths,
    drivers: options.drivers,
    all: true,
  });
  return new Map(tasks.map((task) => [task.connection, task.config.tableName]));
}

async function readMigrationHead(
  database: DatabaseManager,
  connection: string,
  tableName: string | undefined,
): Promise<string | null> {
  const history = await database
    .createMigrator({ connection, tableName, sources: [] })
    .history();
  return history.at(-1)?.name ?? null;
}

interface ConnectionRunOptions {
  readonly check: boolean;
  readonly migrationHead: () => Promise<string | null>;
}

async function generateForConnection(
  connection: DatabaseConnection,
  directory: string,
  options: ConnectionRunOptions,
): Promise<AppCollectionsArtifactConnectionResult> {
  const names: string[] = [];
  for await (const collection of connection.collections.scan()) {
    if (collection.name) names.push(collection.name);
  }
  names.sort();
  assertCollectionArtifactDirectoryNames(names);

  const expected = new Map<string, string>();
  const perCollection = new Map<string, Map<string, string>>();
  for (const name of names) {
    const [resolution, physical, stored] = await Promise.all([
      connection.collections.getResolution(name),
      connection.collections.getPhysical(name),
      connection.collectionMetadata.get(name),
    ]);
    if (!resolution || !physical) {
      throw new Error(
        `Collection "${name}" disappeared while its artifact was being generated.`,
      );
    }
    const files = serializeCollectionArtifact({
      name,
      resolution,
      physical,
      metadata: stored?.document,
    });
    const own = new Map<string, string>();
    for (const kind of FILE_KINDS) {
      const relative = path.posix.join(
        name,
        COLLECTION_ARTIFACT_FILE_NAMES[kind],
      );
      own.set(relative, files[kind]);
      expected.set(relative, files[kind]);
    }
    perCollection.set(name, own);
  }
  const manifest: AppCollectionsArtifactManifestSummary = {
    dialect: connection.dialect,
    migrationHead: await options.migrationHead(),
    collections: names,
  };
  expected.set(
    COLLECTION_ARTIFACT_MANIFEST_FILE_NAME,
    serializeCollectionArtifactManifest({
      connection: connection.name,
      ...manifest,
    }),
  );

  const disk = readDirectory(directory);
  const differences = diff(expected, disk);
  const base = { connection: connection.name, directory, manifest };

  if (options.check) {
    return {
      ...base,
      status: differences.length === 0 ? 'completed' : 'stale',
      differences,
      unchanged: countUnchanged(perCollection, differences),
    };
  }

  if (disk.unexpected.length > 0) {
    throw new Error(
      `Unexpected entries in ${directory}; remove them or move them out of the collections directory: ${disk.unexpected.join(', ')}.`,
    );
  }

  const changed = new Set(
    differences
      .filter((entry) => entry.kind !== 'unexpected')
      .map((entry) => entry.path.split('/')[0]),
  );
  const written: string[] = [];
  const deleted: string[] = [];
  mkdirSync(directory, { recursive: true });
  removeStaleStaging(directory);
  const staging = mkdtempSync(path.join(directory, STAGING_PREFIX));
  try {
    for (const [name, files] of perCollection) {
      if (!changed.has(name)) continue;
      const stagingDirectory = path.join(staging, name);
      mkdirSync(stagingDirectory);
      for (const [relative, content] of files) {
        writeFileSync(path.join(staging, relative), content);
        written.push(relative);
      }
      const target = path.join(directory, name);
      rmSync(target, { recursive: true, force: true });
      renameSync(stagingDirectory, target);
    }
    for (const name of disk.collections) {
      if (perCollection.has(name)) continue;
      for (const relative of disk.files.keys()) {
        if (relative.startsWith(`${name}/`)) deleted.push(relative);
      }
      rmSync(path.join(directory, name), { recursive: true, force: true });
    }
    if (changed.has(COLLECTION_ARTIFACT_MANIFEST_FILE_NAME)) {
      const stagingManifest = path.join(
        staging,
        COLLECTION_ARTIFACT_MANIFEST_FILE_NAME,
      );
      writeFileSync(
        stagingManifest,
        expected.get(COLLECTION_ARTIFACT_MANIFEST_FILE_NAME)!,
      );
      renameSync(
        stagingManifest,
        path.join(directory, COLLECTION_ARTIFACT_MANIFEST_FILE_NAME),
      );
      written.push(COLLECTION_ARTIFACT_MANIFEST_FILE_NAME);
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return {
    ...base,
    status: 'completed',
    written: written.sort(),
    deleted: deleted.sort(),
    unchanged: countUnchanged(perCollection, differences),
  };
}

interface DirectoryState {
  /** Known-shaped files, relative path → content. */
  readonly files: Map<string, string>;
  /** Collection directories present on disk. */
  readonly collections: string[];
  /** Entries the generator does not own and will not touch. */
  readonly unexpected: string[];
}

/**
 * Dot-prefixed entries are ignored rather than reported: editors and operating
 * systems drop them everywhere, and the generator's own staging directories
 * use the prefix too.
 */
function readDirectory(directory: string): DirectoryState {
  const files = new Map<string, string>();
  const collections: string[] = [];
  const unexpected: string[] = [];
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { files, collections, unexpected };
    }
    throw error;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (
      entry.isFile() &&
      entry.name === COLLECTION_ARTIFACT_MANIFEST_FILE_NAME
    ) {
      files.set(
        entry.name,
        readFileSync(path.join(directory, entry.name), 'utf8'),
      );
      continue;
    }
    if (!entry.isDirectory() || entry.name.startsWith('_')) {
      unexpected.push(entry.name);
      continue;
    }
    collections.push(entry.name);
    const collectionDirectory = path.join(directory, entry.name);
    for (const child of readdirSync(collectionDirectory, {
      withFileTypes: true,
    })) {
      if (child.name.startsWith('.')) continue;
      const relative = path.posix.join(entry.name, child.name);
      if (child.isFile() && FILE_NAME_KINDS.has(child.name)) {
        files.set(
          relative,
          readFileSync(path.join(collectionDirectory, child.name), 'utf8'),
        );
      } else {
        unexpected.push(relative);
      }
    }
  }
  return {
    files,
    collections: collections.sort(),
    unexpected: unexpected.sort(),
  };
}

function diff(
  expected: ReadonlyMap<string, string>,
  disk: DirectoryState,
): AppCollectionsArtifactDifference[] {
  const differences: AppCollectionsArtifactDifference[] = [];
  for (const [relative, content] of expected) {
    const current = disk.files.get(relative);
    if (current === undefined)
      differences.push({ path: relative, kind: 'missing' });
    else if (current !== content)
      differences.push({ path: relative, kind: 'stale' });
  }
  for (const relative of disk.files.keys()) {
    if (!expected.has(relative))
      differences.push({ path: relative, kind: 'unexpected' });
  }
  for (const relative of disk.unexpected) {
    differences.push({ path: relative, kind: 'unexpected' });
  }
  return differences.sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
}

function countUnchanged(
  perCollection: ReadonlyMap<string, unknown>,
  differences: readonly AppCollectionsArtifactDifference[],
): number {
  const touched = new Set(differences.map((entry) => entry.path.split('/')[0]));
  let unchanged = 0;
  for (const name of perCollection.keys())
    if (!touched.has(name)) unchanged += 1;
  return unchanged;
}

function removeStaleStaging(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith(STAGING_PREFIX)) {
      rmSync(path.join(directory, entry.name), {
        recursive: true,
        force: true,
      });
    }
  }
}
