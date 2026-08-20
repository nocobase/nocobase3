import { defineMigration } from '@nocobase/database';
import { createWorkflowCollections, workflowCollectionSchemas } from '@nocobase/workflow';

export default defineMigration({
  name: '202608200001_create_workflow_collections',

  async up({ builder }): Promise<void> {
    await createWorkflowCollections(builder);
  },

  async down({ builder }): Promise<void> {
    for (const schema of [...workflowCollectionSchemas].reverse()) {
      await builder.dropCollection(schema.name);
    }
  },
});
