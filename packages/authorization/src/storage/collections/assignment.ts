import type { CollectionBuilder } from '@nocobase/database';

/** Assigns a Permission Set or Group to a user or another subject. */
export function createAssignmentCollection(builder: CollectionBuilder) {
  return builder.createCollection('authzAssignments', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('subjectType', { length: 64 }).notNull();
    collection.string('subjectId', { length: 64 }).notNull();
    collection.string('targetType', { length: 64 }).notNull();
    collection.string('targetId', { length: 64 }).notNull();
    collection.datetime('startsAt').nullable();
    collection.datetime('expiresAt').nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();

    collection.primary('id', { name: 'pk_authz_assignments' });
    collection.unique(['subjectType', 'subjectId', 'targetType', 'targetId'], { name: 'uq_authz_assignments_subject_target' });
    collection.index(['subjectType', 'subjectId'], { name: 'idx_authz_assignments_subject' });
    collection.index(['targetType', 'targetId'], { name: 'idx_authz_assignments_target' });
    collection.index('expiresAt', { name: 'idx_authz_assignments_expires_at' });
  });
}
