import type { DatabaseManager } from '@nocobase/db';

export interface RegisteredDatabaseFileSource {
  readonly id: string;
  readonly table: string;
}

type DatabaseFileSourceRegistry = WeakMap<DatabaseManager, Set<string>>;

const REGISTRY_KEY = Symbol.for(
  '@nocobase/app-plugin-file/file-inventory-sources/v2',
);

export interface RegisterDatabaseFileSourceOptions {
  readonly database: DatabaseManager;
  readonly table: string;
}

export function registerDatabaseFileSource(
  options: RegisterDatabaseFileSourceOptions,
): void {
  const registry = resolveRegistry();
  let tables = registry.get(options.database);
  if (!tables) {
    tables = new Set();
    registry.set(options.database, tables);
  }
  tables.add(options.table);
}

export function listRegisteredDatabaseFileSources(
  database: DatabaseManager,
): readonly RegisteredDatabaseFileSource[] {
  const tables = resolveRegistry().get(database);
  if (!tables) return [];
  return [...tables]
    .sort((left, right) => left.localeCompare(right))
    .map((table) => Object.freeze({ id: table, table }));
}

export function findRegisteredDatabaseFileSource(
  database: DatabaseManager,
  sourceId: string,
): RegisteredDatabaseFileSource | undefined {
  return resolveRegistry().get(database)?.has(sourceId)
    ? Object.freeze({ id: sourceId, table: sourceId })
    : undefined;
}

function resolveRegistry(): DatabaseFileSourceRegistry {
  const runtime = globalThis as Record<PropertyKey, unknown>;
  const existing = runtime[REGISTRY_KEY];
  if (existing instanceof WeakMap) {
    return existing as DatabaseFileSourceRegistry;
  }
  const registry: DatabaseFileSourceRegistry = new WeakMap();
  runtime[REGISTRY_KEY] = registry;
  return registry;
}
