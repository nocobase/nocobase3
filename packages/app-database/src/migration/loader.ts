import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDefinedMigration } from './define.js';
import type {
  LoadedMigration,
  LoadMigrationsOptions,
  MigrationDefinition,
  MigrationSource,
} from './types.js';

export const DEFAULT_MIGRATION_EXTENSIONS = [
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
] as const;
export const DEFAULT_MIGRATION_PACKAGE_NAME = 'app';

export async function loadMigrations(
  options: LoadMigrationsOptions,
): Promise<LoadedMigration[]> {
  const sources = normalizeMigrationSources(options);
  const migrations = (
    await Promise.all(sources.map((source) => loadMigrationSource(source)))
  ).flat();

  validateUniqueMigrationNames(migrations);
  return migrations.sort((a, b) => a.name.localeCompare(b.name));
}

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
  const entries = await readMigrationDirectory(directory);
  const extensions = new Set(source.extensions ?? DEFAULT_MIGRATION_EXTENSIONS);
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => isMigrationFile(fileName, extensions))
    .sort();

  const migrations: LoadedMigration[] = [];
  for (const fileName of files) {
    migrations.push(
      await loadMigrationFile(
        source.packageName,
        join(directory, fileName),
        fileName,
      ),
    );
  }

  return migrations;
}

function normalizeMigrationSources(
  options: LoadMigrationsOptions,
): MigrationSource[] {
  if (options.directory !== undefined && options.sources !== undefined) {
    throw new Error(
      'Migration options cannot define both directory and sources.',
    );
  }

  if (options.sources !== undefined) {
    return options.sources.map((source) => ({
      packageName: validatePackageName(source.packageName),
      directory: validateDirectory(source.directory),
      extensions: source.extensions ?? options.extensions,
    }));
  }

  if (options.directory === undefined) {
    throw new Error('Migration options must define directory or sources.');
  }

  return [
    {
      packageName: validatePackageName(
        options.packageName ?? DEFAULT_MIGRATION_PACKAGE_NAME,
      ),
      directory: validateDirectory(options.directory),
      extensions: options.extensions,
    },
  ];
}

function validateDirectory(directory: unknown): string {
  if (!isNonEmptyString(directory)) {
    throw new Error('Migration directory must be a non-empty string.');
  }
  return directory;
}

function validatePackageName(packageName: unknown): string {
  if (!isNonEmptyString(packageName)) {
    throw new Error('Migration packageName must be a non-empty string.');
  }
  return packageName;
}

async function readMigrationDirectory(directory: string): Promise<Dirent[]> {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function loadMigrationFile(
  packageName: string,
  filePath: string,
  fileName: string,
): Promise<LoadedMigration> {
  const [source, fileStat] = await Promise.all([
    readFile(filePath, 'utf8'),
    stat(filePath),
  ]);
  const checksum = createMigrationChecksum(source);
  const migration = await importMigration(filePath, fileStat.mtimeMs);
  validateMigrationDefinition(migration, filePath, fileName);

  return {
    packageName,
    name: migration.name,
    filePath,
    fileName,
    checksum,
    migration,
  };
}

async function importMigration(
  filePath: string,
  mtimeMs: number,
): Promise<unknown> {
  const url = pathToFileURL(filePath);
  url.searchParams.set('mtime', String(Math.trunc(mtimeMs)));
  const module = await import(url.href);
  return (module as { default?: unknown }).default;
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

  const expectedName = migrationNameFromFileName(fileName);
  if (value.name !== expectedName) {
    throw new Error(
      `Migration file ${filePath} has name "${value.name}", but file name requires "${expectedName}".`,
    );
  }

  if (typeof value.up !== 'function') {
    throw new Error(
      `Migration "${value.name}" must define an up(context) function.`,
    );
  }

  if (
    value.restoreMetadata !== undefined &&
    typeof value.restoreMetadata !== 'function'
  ) {
    throw new Error(
      `Migration "${value.name}" restoreMetadata must be a function when provided.`,
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

function validateUniqueMigrationNames(migrations: LoadedMigration[]): void {
  const seen = new Map<string, LoadedMigration>();
  for (const migration of migrations) {
    const previous = seen.get(migration.name);
    if (previous) {
      throw new Error(
        `Duplicate migration name "${migration.name}" in ${previous.filePath} and ${migration.filePath}.`,
      );
    }
    seen.set(migration.name, migration);
  }
}

function isMigrationFile(fileName: string, extensions: Set<string>): boolean {
  if (fileName.startsWith('.') || fileName.endsWith('.d.ts')) {
    return false;
  }
  return extensions.has(extname(fileName));
}

function migrationNameFromFileName(fileName: string): string {
  return basename(fileName, extname(fileName));
}

function createMigrationChecksum(source: string): string {
  return createHash('sha256')
    .update(normalizeMigrationSourceForChecksum(source))
    .digest('hex');
}

function normalizeMigrationSourceForChecksum(source: string): string {
  return source
    .replaceAll('@nocobase/app-database', '@nocobase/database')
    .replace(
      /import\s*\{\s*defineMigration,\s*type MigrationDefinition,\s*\}\s*from '@nocobase\/database';/,
      "import { defineMigration, type MigrationDefinition } from '@nocobase/database';",
    );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidTransactionMode(value: unknown): boolean {
  return (
    value === undefined || value === true || value === false || value === 'auto'
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
