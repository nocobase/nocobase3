import type { CollectionDefinitionBuilder } from '@nocobase/db';

export function defineWorkflowWaitRequests(
  collection: CollectionDefinitionBuilder,
): void {
  collection.string('id').primary().notNull();
  collection.bigInt('workflowRunId').notNull();
  collection.bigInt('nodeRunId').notNull();
  collection.string('nodeKey').notNull();
  collection.string('idempotencyKey').notNull();
  collection.string('decisionHash').notNull();
  collection.integer('status').notNull();
  collection.json('result');
  collection.text('error');
  collection.string('state').notNull();
  // Null releases the slot after consumption; every node run can have one live request.
  collection.string('slot');
  collection.datetimeTz('createdAt').notNull();
  collection.datetimeTz('claimedAt');
  collection.unique(['workflowRunId', 'nodeKey', 'idempotencyKey'], {
    mode: 'index',
  });
  collection.unique(['nodeRunId', 'slot'], { mode: 'index' });
  collection.index(['state', 'createdAt']);
}
