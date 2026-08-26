import { defineMigration } from '@nocobase/app-database';
import type { Knex } from 'knex';

export default defineMigration({
  name: '202608210001_add_workflow_node_description',

  async up({ builder, connection }): Promise<void> {
    const db = await connection.client<Knex>();
    if (await db.schema.hasColumn('workflow_nodes', 'description')) return;
    await builder.addField('workflowNodes', {
      name: 'description',
      type: 'text',
      nullable: true,
    });
  },

  async down({ builder, connection }): Promise<void> {
    const db = await connection.client<Knex>();
    if (!(await db.schema.hasColumn('workflow_nodes', 'description'))) return;
    await builder.dropField('workflowNodes', 'description');
  },
});
