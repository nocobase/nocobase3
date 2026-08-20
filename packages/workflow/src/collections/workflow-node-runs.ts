import type { CollectionDefinitionBuilder } from '@nocobase/database';

import { WORKFLOW_COLLECTIONS } from './names.js';

export function defineWorkflowNodeRuns(collection: CollectionDefinitionBuilder): void {
  collection.bigInt('id').primary().autoIncrement().notNull();
  collection
    .belongsTo('workflowRun', WORKFLOW_COLLECTIONS.runs)
    .foreignKey('workflowRunId')
    .foreignKeyType('bigInt')
    .notNull()
    .constraints(false)
    .onDelete('cascade');
  collection
    .belongsTo('node', WORKFLOW_COLLECTIONS.nodes)
    .foreignKey('nodeId')
    .foreignKeyType('bigInt')
    .notNull()
    .constraints(false);
  collection.string('nodeKey').notNull();
  collection.integer('status').notNull();
  collection.json('meta');
  collection.json('result');
  collection.datetime('startedAt').notNull();
  collection.text('log');

  collection.index(['workflowRun', 'id']);
}
