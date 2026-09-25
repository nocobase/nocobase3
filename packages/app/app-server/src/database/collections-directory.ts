import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type {
  CollectionMetadataStore,
  CollectionMetadataStoreConfig,
} from '@nocobase/db';

import type { AppPaths } from '../config/index.js';
import type { AppMetadataStoreConfig } from './types.js';

/**
 * Where a connection's generated Collection artifacts live:
 * `database/<connection>/collections`, next to its `migrations` and `seeds`.
 * Everything under it is a cache the generator owns, for every connection.
 */
export function resolveAppCollectionsDirectory(
  name: string,
  paths?: AppPaths,
): string {
  return path.join(databaseRoot(paths), name, 'collections');
}

/**
 * Where a connection's hand-written Collection metadata lives by default:
 * `database/<connection>/metadata`, one `<name>.json` per Collection. It is
 * the source an external connection's metadata store reads, and is committed.
 * Kept apart from `collections/` so a directory is either written by people
 * or generated, never both.
 */
export function resolveAppMetadataDirectory(
  name: string,
  paths?: AppPaths,
): string {
  return path.join(databaseRoot(paths), name, 'metadata');
}

/** Whether `directory` is, or lies inside, a connection's generated collections directory. */
export function isAppCollectionsDirectory(
  directory: string,
  paths?: AppPaths,
): boolean {
  const relative = path.relative(databaseRoot(paths), path.resolve(directory));
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
  return relative.split(path.sep)[1] === 'collections';
}

function databaseRoot(paths?: AppPaths): string {
  return paths?.database() ?? path.resolve('database');
}

export interface ResolveAppMetadataStoreOptions {
  readonly name: string;
  readonly external: boolean;
  /** The top-level `database.metadataStore`, which a connection without its own falls back to. */
  readonly shared?: AppMetadataStoreConfig;
  readonly paths?: AppPaths;
}

/**
 * Turns the application-level forms into what `createDatabaseManager` takes:
 * a string becomes a directory store on that path, a relative directory is
 * resolved against the application root, and an external connection with no
 * store at either level gets one on its own metadata directory. A store
 * instance and a managed connection without configuration pass through.
 */
export function resolveAppMetadataStore(
  value: AppMetadataStoreConfig | undefined,
  options: ResolveAppMetadataStoreOptions,
): CollectionMetadataStore | CollectionMetadataStoreConfig | undefined {
  if (value === undefined) {
    if (options.external && options.shared === undefined) {
      assertNoLegacyCollectionMetadata(options.name, options.paths);
      return {
        type: 'directory',
        directory: resolveAppMetadataDirectory(options.name, options.paths),
      };
    }
    return undefined;
  }
  if (typeof value === 'string') {
    return { type: 'directory', directory: resolveRoot(value, options.paths) };
  }
  if (isStoreInstance(value)) return value;
  return { ...value, directory: resolveRoot(value.directory, options.paths) };
}

/**
 * Earlier releases kept an external connection's hand-written metadata inside
 * its collections directory, as `collections/<name>/metadata.json`. Reading
 * the new default directory instead would find nothing and resolve every
 * Collection without its titles and relations, so the old layout is refused
 * with the move spelled out. It is recognised by what the generator never
 * writes: a collections directory whose manifest is missing or does not say
 * `generated`, holding a `metadata.json` with a document in it.
 */
function assertNoLegacyCollectionMetadata(
  name: string,
  paths?: AppPaths,
): void {
  if (existsSync(resolveAppMetadataDirectory(name, paths))) return;
  const collections = resolveAppCollectionsDirectory(name, paths);
  if (!existsSync(collections) || isGeneratedDirectory(collections)) return;
  const legacy = readdirSync(collections, { withFileTypes: true }).filter(
    (entry) =>
      entry.isDirectory() &&
      !entry.name.startsWith('.') &&
      !entry.name.startsWith('_') &&
      holdsMetadataDocument(
        path.join(collections, entry.name, 'metadata.json'),
      ),
  );
  if (legacy.length === 0) return;
  throw new Error(
    `Connection "${name}" keeps hand-written metadata in the old location, ${path.join(collections, legacy[0].name, 'metadata.json')}. Move each file's "document" to database/${name}/metadata/<name>.json, delete ${collections}, and run "nocobase collections generate --connection ${name}" to rebuild the cache.`,
  );
}

function isGeneratedDirectory(directory: string): boolean {
  const manifest = path.join(directory, '_manifest.json');
  if (!existsSync(manifest)) return false;
  try {
    return (
      (JSON.parse(readFileSync(manifest, 'utf8')) as { generated?: unknown })
        .generated === true
    );
  } catch {
    return false;
  }
}

function holdsMetadataDocument(file: string): boolean {
  if (!existsSync(file)) return false;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
      document?: unknown;
    };
    return parsed.document !== null && parsed.document !== undefined;
  } catch {
    return false;
  }
}

export function isCollectionMetadataStoreInstance(
  value: unknown,
): value is CollectionMetadataStore {
  return isStoreInstance(value);
}

function isStoreInstance(value: unknown): value is CollectionMetadataStore {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as CollectionMetadataStore).initialize === 'function'
  );
}

function resolveRoot(directory: string, paths?: AppPaths): string {
  return path.isAbsolute(directory)
    ? directory
    : path.resolve(paths?.root() ?? process.cwd(), directory);
}
