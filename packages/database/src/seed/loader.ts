import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDefinedSeed } from './define.js';
import type {
  LoadSeedsOptions,
  LoadedSeed,
  SeedDefinition,
  SeedSource,
} from './types.js';

export const DEFAULT_SEED_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts'] as const;
export const DEFAULT_SEED_PACKAGE_NAME = 'app';

export async function loadSeeds(
  options: LoadSeedsOptions,
): Promise<LoadedSeed[]> {
  const sources = normalizeSeedSources(options);
  const seeds = (
    await Promise.all(sources.map((source) => loadSeedSource(source)))
  ).flat();

  validateUniqueSeedNames(seeds);
  return seeds.sort((a, b) => a.name.localeCompare(b.name));
}

export async function validateSeeds(
  options: string | LoadSeedsOptions,
): Promise<LoadedSeed[]> {
  return loadSeeds(
    typeof options === 'string' ? { directory: options } : options,
  );
}

async function loadSeedSource(source: SeedSource): Promise<LoadedSeed[]> {
  const directory = resolve(source.directory);
  const entries = await readSeedDirectory(directory);
  const extensions = new Set(source.extensions ?? DEFAULT_SEED_EXTENSIONS);
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => isSeedFile(fileName, extensions))
    .sort();

  const seeds: LoadedSeed[] = [];
  for (const fileName of files) {
    seeds.push(
      await loadSeedFile(
        source.packageName,
        join(directory, fileName),
        fileName,
      ),
    );
  }

  return seeds;
}

function normalizeSeedSources(options: LoadSeedsOptions): SeedSource[] {
  if (options.directory !== undefined && options.sources !== undefined) {
    throw new Error('Seed options cannot define both directory and sources.');
  }

  if (options.sources !== undefined) {
    return options.sources.map((source) => ({
      packageName: validatePackageName(source.packageName),
      directory: validateDirectory(source.directory),
      extensions: source.extensions ?? options.extensions,
    }));
  }

  if (options.directory === undefined) {
    throw new Error('Seed options must define directory or sources.');
  }

  return [
    {
      packageName: validatePackageName(
        options.packageName ?? DEFAULT_SEED_PACKAGE_NAME,
      ),
      directory: validateDirectory(options.directory),
      extensions: options.extensions,
    },
  ];
}

function validateDirectory(directory: unknown): string {
  if (!isNonEmptyString(directory)) {
    throw new Error('Seed directory must be a non-empty string.');
  }
  return directory;
}

function validatePackageName(packageName: unknown): string {
  if (!isNonEmptyString(packageName)) {
    throw new Error('Seed packageName must be a non-empty string.');
  }
  return packageName;
}

async function readSeedDirectory(directory: string): Promise<Dirent[]> {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function loadSeedFile(
  packageName: string,
  filePath: string,
  fileName: string,
): Promise<LoadedSeed> {
  const [source, fileStat] = await Promise.all([
    readFile(filePath, 'utf8'),
    stat(filePath),
  ]);
  const checksum = createHash('sha256').update(source).digest('hex');
  const seed = await importSeed(filePath, fileStat.mtimeMs);
  validateSeedDefinition(seed, filePath, fileName);

  return {
    packageName,
    name: seed.name,
    filePath,
    fileName,
    checksum,
    seed,
  };
}

async function importSeed(filePath: string, mtimeMs: number): Promise<unknown> {
  const url = pathToFileURL(filePath);
  url.searchParams.set('mtime', String(Math.trunc(mtimeMs)));
  const module = await import(url.href);
  return (module as { default?: unknown }).default;
}

function validateSeedDefinition(
  value: unknown,
  filePath: string,
  fileName: string,
): asserts value is SeedDefinition {
  if (!isDefinedSeed(value)) {
    throw new Error(
      `Seed file ${filePath} must default export defineSeed({...}).`,
    );
  }

  if (!isNonEmptyString(value.name)) {
    throw new Error(
      `Seed file ${filePath} must define a non-empty string name.`,
    );
  }

  const expectedName = basename(fileName, extname(fileName));
  if (value.name !== expectedName) {
    throw new Error(
      `Seed file ${filePath} has name "${value.name}", but file name requires "${expectedName}".`,
    );
  }

  if (typeof value.run !== 'function') {
    throw new Error(
      `Seed "${value.name}" must define a run(context) function.`,
    );
  }

  if (
    value.transaction !== undefined &&
    value.transaction !== true &&
    value.transaction !== false &&
    value.transaction !== 'auto'
  ) {
    throw new Error(
      `Seed "${value.name}" transaction must be true, false, or "auto".`,
    );
  }
}

function validateUniqueSeedNames(seeds: LoadedSeed[]): void {
  const seen = new Map<string, LoadedSeed>();
  for (const seed of seeds) {
    const previous = seen.get(seed.name);
    if (previous) {
      throw new Error(
        `Duplicate seed name "${seed.name}" in ${previous.filePath} and ${seed.filePath}.`,
      );
    }
    seen.set(seed.name, seed);
  }
}

function isSeedFile(fileName: string, extensions: Set<string>): boolean {
  if (fileName.startsWith('.') || fileName.endsWith('.d.ts')) {
    return false;
  }
  return extensions.has(extname(fileName));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
