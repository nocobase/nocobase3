/**
 * Tables NocoBase creates for its own bookkeeping — migration and seed
 * histories, their locks, and the Collection metadata store — all share this
 * prefix by default. They are not Collections: they carry no logical name, and
 * listing or scanning a migrated database would otherwise fail on the first of
 * them because `__nocobase_migrations` cannot be mapped back to a logical name.
 *
 * Matching by prefix covers the defaults and any custom `tableName` that keeps
 * the convention. A bookkeeping table named outside it is declared per
 * connection through `internalTables`, since the connection cannot otherwise
 * know what a Migrator or Seeder running on it was configured with.
 */
export const NOCOBASE_INTERNAL_TABLE_PREFIX = '__nocobase_';

export function isNocoBaseInternalTable(tableName: string): boolean {
  return tableName.startsWith(NOCOBASE_INTERNAL_TABLE_PREFIX);
}
