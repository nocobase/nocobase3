import type { IntegrationTestContext } from '../../helpers.js';

/** The project/task subset of the public documentation model, with explicit keys. */
export async function createDocumentationFixture(
  context: IntegrationTestContext,
): Promise<void> {
  await context.builder.createCollections([
    {
      name: 'tasks',
      definition: (c) => {
        c.string('id').primary().notNull();
        c.string('title').notNull();
        c.string('status').notNull().defaultTo('draft');
        c.integer('priority').nullable();
        c.integer('points').notNull().defaultTo(0);
        c.string('projectId').nullable();
      },
    },
    {
      name: 'projects',
      definition: (c) => {
        c.string('id').primary().notNull();
        c.string('name').notNull();
        c.string('status').notNull().defaultTo('draft');
        c.integer('version').notNull();
        c.optimisticLock('version');
        c.hasMany('tasks', 'tasks').sourceKey('id').foreignKey('projectId');
      },
    },
  ]);
}

export async function seedDocumentationProjects(
  context: IntegrationTestContext,
  prefix: string,
): Promise<void> {
  await context.db(context.table('projects')).insert([
    { id: `${prefix}-a`, name: 'A', status: 'active', version: 1 },
    { id: `${prefix}-b`, name: 'B', status: 'active', version: 1 },
    { id: `${prefix}-c`, name: 'C', status: 'draft', version: 1 },
  ]);
}
