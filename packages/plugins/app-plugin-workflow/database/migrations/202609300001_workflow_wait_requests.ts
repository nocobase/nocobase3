import { defineMigration } from '@nocobase/db';

export default defineMigration({
  name: '202609300001_workflow_wait_requests',
  async up({ builder }): Promise<void> {
    await builder.alterCollection('workflowRuns', (collection) => {
      collection.string('waitLockToken');
      collection.datetimeTz('waitLockAt');
    });
    await builder.createCollection('workflowWaitRequests', (collection) => {
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
      collection.string('slot');
      collection.datetimeTz('createdAt').notNull();
      collection.datetimeTz('claimedAt');
      collection.unique(['workflowRunId', 'nodeKey', 'idempotencyKey'], {
        mode: 'index',
      });
      collection.unique(['nodeRunId', 'slot'], { mode: 'index' });
      collection.index(['state', 'createdAt']);
    });
  },
  async down({ builder }): Promise<void> {
    await builder.dropCollection('workflowWaitRequests');
    await builder.alterCollection('workflowRuns', (collection) => {
      collection.dropField('waitLockAt');
      collection.dropField('waitLockToken');
    });
  },
});
