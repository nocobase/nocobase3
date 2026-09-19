import type { DatabaseCapabilities } from '../schema/adapter.js';

export function resolveDatabaseCapabilities(
  overrides: Partial<DatabaseCapabilities> = {},
): DatabaseCapabilities {
  const base: DatabaseCapabilities = {
    schemas: false,
    views: true,
    replaceView: true,
    materializedViews: false,
    refreshMaterializedViews: false,
    foreignKeys: true,
    deferrableConstraints: false,
    partialIndexes: false,
    nativeTypes: false,
    comments: false,
  };

  return { ...base, ...overrides };
}
