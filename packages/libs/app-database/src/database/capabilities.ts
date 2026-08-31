import type { DatabaseCapabilities } from '../schema/index.js';

export function resolveDatabaseCapabilities(
  dialect: string,
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

  if (dialect === 'postgres') {
    Object.assign(base, {
      schemas: true,
      materializedViews: true,
      refreshMaterializedViews: true,
      deferrableConstraints: true,
      partialIndexes: true,
      nativeTypes: true,
      comments: true,
    });
  }

  if (dialect === 'mysql') {
    Object.assign(base, {
      schemas: false,
      replaceView: true,
      comments: true,
      nativeTypes: true,
    });
  }

  if (dialect === 'sqlite') {
    Object.assign(base, {
      partialIndexes: true,
    });
  }

  return { ...base, ...overrides };
}
