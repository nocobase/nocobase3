import { createHash } from 'node:crypto';
import {
  readTaskManifest,
  resolveTaskChecksum,
  type TaskManifest,
} from './manifest.js';
import {
  assertTaskSourceForm,
  DEFAULT_TASK_EXTENSIONS,
  DEFAULT_TASK_PACKAGE_NAME,
  importTaskDefinition,
  isNonEmptyString,
  isTaskFile,
  isValidTransactionMode,
  readTaskDirectory,
  taskNameFromFileName,
  validateTaskDirectory,
  validateTaskPackageName,
  validateUniqueTaskNames,
} from './internal/task-loader.js';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isDefinedMigration } from './internal/marker.js';
import type {
  LoadedMigration,
  LoadMigrationsOptions,
  MigrationDefinition,
  MigrationSource,
} from './types.js';

export const DEFAULT_MIGRATION_EXTENSIONS: readonly string[] =
  DEFAULT_TASK_EXTENSIONS;
export const DEFAULT_MIGRATION_PACKAGE_NAME: string = DEFAULT_TASK_PACKAGE_NAME;

/** Loads, validates, and deterministically orders migration definitions from configured sources. */
export async function loadMigrations(
  options: LoadMigrationsOptions,
): Promise<LoadedMigration[]> {
  const sources = normalizeMigrationSources(options);
  const migrations = (
    await Promise.all(sources.map((source) => loadMigrationSource(source)))
  ).flat();

  validateUniqueTaskNames('Migration', migrations);
  return migrations.sort((a, b) => a.name.localeCompare(b.name));
}

/** Loads migration definitions without executing them. */
export async function validateMigrations(
  options: string | LoadMigrationsOptions,
): Promise<LoadedMigration[]> {
  return loadMigrations(
    typeof options === 'string' ? { directory: options } : options,
  );
}

async function loadMigrationSource(
  source: MigrationSource,
): Promise<LoadedMigration[]> {
  const directory = resolve(source.directory);
  const manifest = await readTaskManifest(directory);
  const entries = await readTaskDirectory(directory);
  const extensions = new Set(source.extensions ?? DEFAULT_MIGRATION_EXTENSIONS);
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => isTaskFile(fileName, extensions))
    .sort();

  const migrations: LoadedMigration[] = [];
  for (const fileName of files) {
    migrations.push(
      await loadMigrationFile(
        source.packageName,
        join(directory, fileName),
        fileName,
        manifest,
        source.parameters,
        source.configuration,
      ),
    );
  }

  return migrations;
}

function normalizeMigrationSources(
  options: LoadMigrationsOptions,
): MigrationSource[] {
  assertTaskSourceForm('Migration', options);

  if (options.sources !== undefined) {
    return options.sources.map((source) => ({
      parameters: normalizeParameters(source.parameters),
      configuration: source.configuration?.map((entry) =>
        Object.freeze({ ...entry }),
      ),
      packageName: validateTaskPackageName('Migration', source.packageName),
      directory: validateTaskDirectory('Migration', source.directory),
      extensions: source.extensions ?? options.extensions,
    }));
  }

  return [
    {
      packageName: validateTaskPackageName(
        'Migration',
        options.packageName ?? DEFAULT_MIGRATION_PACKAGE_NAME,
      ),
      directory: validateTaskDirectory('Migration', options.directory),
      extensions: options.extensions,
    },
  ];
}

async function loadMigrationFile(
  packageName: string,
  filePath: string,
  fileName: string,
  manifest: TaskManifest | undefined,
  parameters?: Readonly<Record<string, string>>,
  configuration?: readonly Readonly<Record<string, unknown>>[],
): Promise<LoadedMigration> {
  const [source, fileStat] = await Promise.all([
    readFile(filePath, 'utf8'),
    stat(filePath),
  ]);
  const checksums = resolveTaskChecksum(filePath, source, manifest);
  const migration = await importTaskDefinition(filePath, fileStat.mtimeMs);
  validateMigrationDefinition(migration, filePath, fileName);

  return {
    packageName,
    configuration,
    name: parameters
      ? `${migration.name}_${createHash('sha256').update(JSON.stringify(parameters)).digest('hex')}`
      : migration.name,
    ...(parameters ? { parameters } : {}),
    filePath,
    fileName,
    ...checksums,
    migration,
  };
}

function validateMigrationDefinition(
  value: unknown,
  filePath: string,
  fileName: string,
): asserts value is MigrationDefinition {
  if (!isDefinedMigration(value)) {
    throw new Error(
      `Migration file ${filePath} must default export defineMigration({...}).`,
    );
  }

  if (!isNonEmptyString(value.name)) {
    throw new Error(
      `Migration file ${filePath} must define a non-empty string name.`,
    );
  }

  const expectedName = taskNameFromFileName(fileName);
  if (value.name !== expectedName) {
    throw new Error(
      `Migration file ${filePath} has name "${value.name}", but file name requires "${expectedName}".`,
    );
  }

  if (value.shouldRun !== undefined && typeof value.shouldRun !== 'function') {
    throw new Error(
      `Migration "${value.name}" shouldRun must be a function when provided.`,
    );
  }

  if (typeof value.up !== 'function') {
    throw new Error(
      `Migration "${value.name}" must define an up(context) function.`,
    );
  }

  if (value.down !== undefined && typeof value.down !== 'function') {
    throw new Error(
      `Migration "${value.name}" down must be a function when provided.`,
    );
  }

  if (value.down === undefined && value.irreversible !== true) {
    throw new Error(
      `Migration "${value.name}" must define down(context) or set irreversible: true.`,
    );
  }

  if (value.down !== undefined && value.irreversible === true) {
    throw new Error(
      `Migration "${value.name}" cannot define down(context) and irreversible: true at the same time.`,
    );
  }

  if (!isValidTransactionMode(value.transaction)) {
    throw new Error(
      `Migration "${value.name}" transaction must be true, false, or "auto".`,
    );
  }
}

function normalizeParameters(
  parameters: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> | undefined {
  if (parameters === undefined) return undefined;
  const entries = Object.entries(parameters).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  if (entries.some(([, value]) => typeof value !== 'string')) {
    throw new Error('Migration source parameters must be strings.');
  }
  return entries.length
    ? Object.freeze(Object.fromEntries(entries))
    : undefined;
}
