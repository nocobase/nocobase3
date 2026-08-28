import type { CollectionDefinitionBuilder } from '@nocobase/app-database';

import { WORKFLOW_COLLECTIONS } from './names.js';

export function defineWorkflowRuns(
  collection: CollectionDefinitionBuilder,
): void {
  collection.bigInt('id').primary().autoIncrement().notNull();
  collection
    .belongsTo('workflow', WORKFLOW_COLLECTIONS.workflows)
    .foreignKey('workflowId')
    .foreignKeyType('bigInt')
    .notNull()
    .constraints(false);
  collection.string('workflowKey').notNull();
  collection.string('hash');
  collection.string('eventKey').notNull().unique({ mode: 'index' });
  collection
    .hasMany('nodeRuns', WORKFLOW_COLLECTIONS.nodeRuns)
    .foreignKey('workflowRunId')
    .onDelete('cascade');
  collection.json('input').notNull().defaultTo({});
  collection.json('parameters').notNull().defaultTo({});
  collection.integer('status');
  collection.boolean('dispatched').notNull().defaultTo(false);
  collection.bigInt('parentRunId');
  collection.json('stack');
  collection.json('output');
  collection.datetime('startedAt');
  collection.datetime('finishedAt');
  collection.datetime('expiresAt');
  collection.datetime('createdAt').notNull();
  collection.boolean('manually').notNull().defaultTo(false);
  collection.string('reason');

  collection.index(['dispatched', 'id']);
  collection.index(['status', 'expiresAt']);
  collection.index(['parentRunId', 'status']);
}
