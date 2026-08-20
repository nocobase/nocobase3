import type { CollectionDefinitionBuilder } from '@nocobase/database';

import { WORKFLOW_COLLECTIONS } from './names.js';

export function defineWorkflowNodes(collection: CollectionDefinitionBuilder): void {
  collection.bigInt('id').primary().autoIncrement().notNull();
  collection.string('key').notNull();
  collection.string('title');
  collection
    .belongsTo('workflow', WORKFLOW_COLLECTIONS.workflows)
    .foreignKey('workflowId')
    .foreignKeyType('bigInt')
    .notNull()
    .constraints(false)
    .onDelete('cascade');
  collection.string('upstreamKey');
  collection
    .hasMany('branches', WORKFLOW_COLLECTIONS.nodes)
    .sourceKey('key')
    .foreignKey('upstreamKey');
  collection.string('branchKey');
  collection.string('downstreamKey');
  collection.string('type').notNull();
  collection.json('config').notNull().defaultTo({});
  collection.json('output').notNull().defaultTo({});

  collection.unique(['workflow', 'key'], { mode: 'index' });
}
