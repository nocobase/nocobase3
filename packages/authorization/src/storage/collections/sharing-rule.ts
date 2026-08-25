import type { BuilderResult, CollectionBuilder } from '@nocobase/app-database';

/** Stores rule metadata; explicit record IDs live in authzSharingRuleRecords. */
export function createSharingRuleCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection('authzSharingRules', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('key', { length: 255 }).notNull();
    collection.string('title', { length: 255 }).nullable();
    collection.string('resource', { length: 255 }).notNull();
    collection.json('actions').notNull();
    collection.json('subjects').notNull();
    collection.string('recordType', { length: 32 }).notNull();
    collection.json('scopes').nullable();
    collection.datetime('startsAt').nullable();
    collection.datetime('expiresAt').nullable();
    collection.text('reason').nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();

    collection.primary('id', { name: 'pk_authz_sharing_rules' });
    collection.unique('key', { name: 'uq_authz_sharing_rules_key' });
    collection.index('resource', { name: 'idx_authz_sharing_rules_resource' });
  });
}
