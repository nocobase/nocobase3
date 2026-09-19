import type { MigrationDefinition } from './types.js';
import { markMigrationDefinition } from './internal/marker.js';

/** Marks and returns a migration definition for discovery by the migration loader. */
export function defineMigration<T extends MigrationDefinition>(
  definition: T,
): T {
  return markMigrationDefinition(definition);
}
