import type { BuilderResult, CollectionBuilder } from '@nocobase/app-database';

/** Stores one explicit shared record per row, avoiding unbounded JSON arrays. */
export function createSharingRuleRecordCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection('authzSharingRuleRecords', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('sharingRuleId', { length: 64 }).notNull();
    collection.string('recordId', { length: 255 }).notNull();
    collection.datetime('createdAt').notNull();

    collection
      .belongsTo('sharingRule', 'authzSharingRules', { index: false })
      .foreignKey('sharingRuleId')
      .constraints(false);
    collection.primary('id', { name: 'pk_authz_sharing_rule_records' });
    collection.unique(['sharingRuleId', 'recordId'], {
      name: 'uq_authz_sharing_rule_records_pair',
    });
    collection.index(['recordId', 'sharingRuleId'], {
      name: 'idx_authz_sharing_rule_records_record',
    });
  });
}
