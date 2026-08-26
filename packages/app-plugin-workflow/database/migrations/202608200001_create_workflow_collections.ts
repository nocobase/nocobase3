import { defineMigration } from '@nocobase/database';
import { workflowCollectionSchemas } from '../../server/collections/index.js';

export default defineMigration({
  name: '202608200001_create_workflow_collections',
  previousChecksums: [
    // Originally shipped from the application template and Playground.
    '83fdce58c77109965bcd22cfcccf2f9c02b75505d1cf5e371c4d88891b0701ed',
  ],

  async up({ builder }): Promise<void> {
    for (const schema of workflowCollectionSchemas) {
      await builder.createCollection(schema.name, schema.define);
    }
  },

  async down({ builder }): Promise<void> {
    for (const schema of [...workflowCollectionSchemas].reverse()) {
      await builder.dropCollection(schema.name);
    }
  },
});
