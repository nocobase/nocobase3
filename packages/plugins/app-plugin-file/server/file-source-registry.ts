import type { DatabaseManager } from '@nocobase/db';

export interface RegisteredDatabaseFileSource {
  readonly id: string;
  readonly table: string;
  readonly publicBasePath: string;
  readonly audiences: readonly string[];
  readonly registrations: number;
  readonly scoped: boolean;
}

interface MutableDatabaseFileSource {
  readonly table: string;
  readonly publicBasePath: string;
  readonly audiences: Set<string>;
  registrations: number;
  scoped: boolean;
}

type DatabaseFileSourceRegistry = WeakMap<
  DatabaseManager,
  Map<string, MutableDatabaseFileSource>
>;

const REGISTRY_KEY = Symbol.for(
  '@nocobase/app-plugin-file/file-inventory-sources/v1',
);

export interface RegisterDatabaseFileSourceOptions {
  readonly database: DatabaseManager;
  readonly table: string;
  readonly publicBasePath: string;
  readonly audience: string;
  readonly scoped: boolean;
}

export function registerDatabaseFileSource(
  options: RegisterDatabaseFileSourceOptions,
): void {
  const registry = resolveRegistry();
  let sources = registry.get(options.database);
  if (!sources) {
    sources = new Map();
    registry.set(options.database, sources);
  }
  const key = sourceKey(options.publicBasePath, options.table);
  const existing = sources.get(key);
  if (existing) {
    existing.audiences.add(options.audience);
    existing.registrations += 1;
    existing.scoped ||= options.scoped;
    return;
  }
  sources.set(key, {
    table: options.table,
    publicBasePath: normalizePublicBasePath(options.publicBasePath),
    audiences: new Set([options.audience]),
    registrations: 1,
    scoped: options.scoped,
  });
}

export function listRegisteredDatabaseFileSources(
  database: DatabaseManager,
  publicBasePath: string,
): readonly RegisteredDatabaseFileSource[] {
  const normalizedBasePath = normalizePublicBasePath(publicBasePath);
  const sources = resolveRegistry().get(database);
  if (!sources) return [];
  return [...sources.values()]
    .filter((source) => source.publicBasePath === normalizedBasePath)
    .map(toRegisteredSource)
    .sort((left, right) => left.table.localeCompare(right.table));
}

export function findRegisteredDatabaseFileSource(
  database: DatabaseManager,
  publicBasePath: string,
  sourceId: string,
): RegisteredDatabaseFileSource | undefined {
  const source = resolveRegistry()
    .get(database)
    ?.get(sourceKey(publicBasePath, sourceId));
  return source ? toRegisteredSource(source) : undefined;
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

function toRegisteredSource(
  source: MutableDatabaseFileSource,
): RegisteredDatabaseFileSource {
  return Object.freeze({
    id: source.table,
    table: source.table,
    publicBasePath: source.publicBasePath,
    audiences: Object.freeze([...source.audiences].sort()),
    registrations: source.registrations,
    scoped: source.scoped,
  });
}

function sourceKey(publicBasePath: string, table: string): string {
  return `${normalizePublicBasePath(publicBasePath)}\u0000${table}`;
}

function normalizePublicBasePath(value: string): string {
  const normalized = value.trim().replace(/^\/+|\/+$/gu, '');
  return normalized ? `/${normalized}` : '';
}
