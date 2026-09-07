import { defineMigration } from '@nocobase/db';

export default defineMigration({
  name: '202609060001_workflow_audit_context',
  async up({ builder }): Promise<void> {
    await builder.alterCollection('workflowRuns', (collection) => {
      collection.json('auditContext');
    });
  },
  async down({ builder }): Promise<void> {
    await builder.alterCollection('workflowRuns', (collection) => {
      collection.dropField('auditContext');
    });
  },
});
