import path from 'node:path';

import type {
  CollectionMetadataStore,
  CollectionMetadataStoreConfig,
} from '@nocobase/db';

import type { AppPaths } from '../config/index.js';
import type { AppMetadataStoreConfig } from './types.js';

/**
 * Where a connection's Collection artifacts live: `database/<connection>/collections`,
 * next to its `migrations` and `seeds`. The generator writes here and an
 * external connection's metadata store reads from here by default, so both
 * resolve the path through this one function.
 */
export function resolveAppCollectionsDirectory(
  name: string,
  paths?: AppPaths,
): string {
  const root = paths?.database() ?? path.resolve('database');
  return path.join(root, name, 'collections');
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
 * store at either level gets one on its own collections directory. A store
 * instance and a managed connection without configuration pass through.
 */
export function resolveAppMetadataStore(
  value: AppMetadataStoreConfig | undefined,
  options: ResolveAppMetadataStoreOptions,
): CollectionMetadataStore | CollectionMetadataStoreConfig | undefined {
  if (value === undefined) {
    if (options.external && options.shared === undefined) {
      return {
        type: 'directory',
        directory: resolveAppCollectionsDirectory(options.name, options.paths),
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
