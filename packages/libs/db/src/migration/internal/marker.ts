import type { MigrationDefinition } from '../types.js';

export const MIGRATION_DEFINITION_SYMBOL: symbol = Symbol.for(
  '@nocobase/db.migration',
);

export function markMigrationDefinition<T extends MigrationDefinition>(
  definition: T,
): T {
  Object.defineProperty(definition, MIGRATION_DEFINITION_SYMBOL, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  return definition;
}

export function isDefinedMigration(
  value: unknown,
): value is MigrationDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[MIGRATION_DEFINITION_SYMBOL] === true
  );
}
