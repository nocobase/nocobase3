/**
 * Tables NocoBase creates for its own bookkeeping — migration and seed
 * histories, their locks, and the Collection metadata store — all share this
 * prefix. They are not Collections: they carry no logical name, and listing or
 * scanning a migrated database would otherwise fail on the first of them
 * because `__nocobase_migrations` cannot be mapped back to a logical name.
 *
 * Matching by prefix rather than by the default table names keeps a custom
 * `tableName` that follows the convention covered without the connection
 * having to know each subsystem's configuration.
 */
export const NOCOBASE_INTERNAL_TABLE_PREFIX = '__nocobase_';

export function isNocoBaseInternalTable(tableName: string): boolean {
  return tableName.startsWith(NOCOBASE_INTERNAL_TABLE_PREFIX);
}
