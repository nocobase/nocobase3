import { defineMigration } from '@nocobase/app-database';
import type { Knex } from 'knex';

export default defineMigration({
  name: '202608220001_add_workflow_node_run_error',

  async up({ builder, connection }): Promise<void> {
    const db = await connection.client<Knex>();
    if (await db.schema.hasColumn('workflow_node_runs', 'error')) return;
    await builder.addField('workflowNodeRuns', {
      name: 'error',
      type: 'text',
      nullable: true,
    });
  },

  async down({ builder, connection }): Promise<void> {
    const db = await connection.client<Knex>();
    if (!(await db.schema.hasColumn('workflow_node_runs', 'error'))) return;
    await builder.dropField('workflowNodeRuns', 'error');
  },
});
