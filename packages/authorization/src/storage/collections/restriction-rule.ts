import type { BuilderResult, CollectionBuilder } from '@nocobase/database';

/** Stores mandatory record boundaries that intersect all positive record grants. */
export function createRestrictionRuleCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection('authzRestrictionRules', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('key', { length: 255 }).notNull();
    collection.string('title', { length: 255 }).nullable();
    collection.string('resource', { length: 255 }).notNull();
    collection.json('actions').notNull();
    collection.json('subjects').notNull();
    collection.json('scopes').notNull();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();

    collection.primary('id', { name: 'pk_authz_restriction_rules' });
    collection.unique('key', { name: 'uq_authz_restriction_rules_key' });
    collection.index('resource', {
      name: 'idx_authz_restriction_rules_resource',
    });
  });
}
