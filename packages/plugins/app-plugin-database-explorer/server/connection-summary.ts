import type { ConnectionConfig } from '@nocobase/db';

import type { ConnectionSummary } from './types.js';

/**
 * Describes one configured connection for the Explorer.
 *
 * The copy is an allow-list, and deliberately so. A connection configuration
 * carries `password` and `username`, an `ssl` value whose object form holds
 * certificate and key material, an open `driverOptions` record where a driver's
 * own auth options live, a `pool`, a `metadataStore` that may be a live object,
 * and functions. A redaction pass would have to be extended for each, and would
 * leak whichever one nobody remembered.
 *
 * The dialect list is open — `DatabaseDialect` is `string`, and a dialect
 * package supplies its own configuration shape — so a dialect added later may
 * introduce a field like an API token. Naming what may leave means that field
 * stays inside without anyone revisiting this file; a deny-list would publish
 * it the day it was added. That is the whole argument for the switch below.
 *
 * Host, port, socket path, and SQLite filename are excluded as well, though
 * they are not secrets. They locate the database on a network or a disk, which
 * turns a screenshot of this page into a target, and a schema browser has no
 * use for them.
 */
export function describeConnection(
  name: string,
  config: ConnectionConfig,
  defaultConnection: string | null,
): ConnectionSummary {
  const base: ConnectionSummary = {
    name,
    isDefault: name === defaultConnection,
    dialect: config.dialect,
    ...optional('driver', text(readKey(config, 'driver'))),
    schemaManagement: config.schemaManagement ?? 'managed',
    ...optional('naming', naming(readKey(config, 'naming'))),
    ...optional('internalTables', strings(readKey(config, 'internalTables'))),
  };

  switch (config.dialect) {
    case 'sqlite':
      // The database is a file, and its path is exactly what must not leave.
      return base;
    case 'postgres':
      return {
        ...base,
        ...optional('databaseName', text(readKey(config, 'database'))),
        ...optional('schemas', schemas(readKey(config, 'schema'))),
      };
    case 'mysql':
    case 'mssql':
      return {
        ...base,
        ...optional('databaseName', text(readKey(config, 'database'))),
      };
    case 'oracle':
      return {
        ...base,
        ...optional('databaseName', text(readKey(config, 'serviceName'))),
      };
    default:
      // A dialect this plugin does not know reports base fields only.
      return base;
  }
}

export function describeConnections(
  connections: Readonly<Record<string, ConnectionConfig>>,
  defaultConnection: string | null,
): readonly ConnectionSummary[] {
  return Object.keys(connections)
    .sort()
    .flatMap((name) => {
      const config = connections[name];
      return config
        ? [describeConnection(name, config, defaultConnection)]
        : [];
    });
}

function readKey(config: ConnectionConfig, key: string): unknown {
  return (config as unknown as Readonly<Record<string, unknown>>)[key];
}

function optional<TKey extends string, TValue>(
  key: TKey,
  value: TValue | undefined,
): Record<TKey, TValue> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<TKey, TValue>);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function schemas(value: unknown): readonly string[] | undefined {
  const list = typeof value === 'string' ? [value] : strings(value);
  return list && list.length > 0 ? list : undefined;
}

function strings(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter(
    (item: unknown): item is string => typeof item === 'string',
  );
  return items.length === value.length ? items : undefined;
}

function naming(value: unknown): ConnectionSummary['naming'] | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const source = value as Readonly<Record<string, unknown>>;
  const underscored =
    typeof source.underscored === 'boolean' ? source.underscored : undefined;
  const tablePrefix = text(source.tablePrefix);
  if (underscored === undefined && tablePrefix === undefined) return undefined;
  return {
    ...optional('underscored', underscored),
    ...optional('tablePrefix', tablePrefix),
  };
}
