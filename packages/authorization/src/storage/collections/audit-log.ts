import type { BuilderResult, CollectionBuilder } from '@nocobase/app-database';

/** Records authorization configuration and system-access events. */
export function createAuditLogCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection('authzAuditLogs', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('event', { length: 128 }).notNull();
    collection.string('actorType', { length: 64 }).notNull();
    collection.string('actorId', { length: 64 }).nullable();
    collection.string('resourceType', { length: 128 }).nullable();
    collection.string('resourceId', { length: 64 }).nullable();
    collection.json('details').notNull();
    collection.datetime('createdAt').notNull();

    collection.primary('id', { name: 'pk_authz_audit_logs' });
    collection.index(['event', 'createdAt'], {
      name: 'idx_authz_audit_logs_event_created',
    });
    collection.index(['actorType', 'actorId'], {
      name: 'idx_authz_audit_logs_actor',
    });
  });
}
