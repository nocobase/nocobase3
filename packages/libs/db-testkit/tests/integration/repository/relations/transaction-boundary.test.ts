import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createMutationFixture } from '../fixtures/mutations.js';

describeIntegrationDatabases(
  'Repository explicit relation transaction boundary',
  (context) => {
    it('rolls back earlier calls and nested writes when a later relation error escapes the transaction', async () => {
      const fixture = await createMutationFixture(context);
      const projects = context.database.repository('repositoryProjects');
      const project = await projects.createOne({
        values: {
          name: 'Original',
          tags: {
            connect: {
              where: { id: fixture.databaseTag },
              through: { role: 'reader' },
            },
          },
        },
      });
      const tables = [
        'repositoryProjects',
        'repositoryUsers',
        'repositoryTasks',
        'repositoryTagsForMutation',
        'repositoryProjectTags',
      ];
      const snapshot = () =>
        Promise.all(
          tables.map((t) => context.db(context.table(t)).orderBy('id')),
        );
      const before = await snapshot();
      await expect(
        context.database.transaction(async (connection) => {
          const txProjects = connection.repository('repositoryProjects');
          await connection.repository('repositoryUsers').createOne({
            values: { name: 'Temporary', email: 'transaction@example.com' },
          });
          await txProjects.updateOne({
            filter: { id: project.record.id as number },
            ifVersion: 1,
            values: {
              name: 'Intermediate',
              tasks: { create: { title: 'Temporary task' } },
            },
          });
          expect(
            await txProjects.findOne({
              filter: { id: project.record.id as number },
              select: (s) => s.fields('name', 'version'),
            }),
          ).toEqual({ name: 'Intermediate', version: 2 });
          await txProjects.updateOne({
            filter: { id: project.record.id as number },
            ifVersion: 2,
            values: {
              name: 'Must roll back',
              tags: (t) =>
                t
                  .connect(
                    { id: fixture.databaseTag },
                    { through: { role: 'changed' } },
                  )
                  .create({ label: 'temporary-transaction' })
                  .connect({ id: -1 }),
            },
          });
        }, context.spec.name),
      ).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND' });
      expect(await snapshot()).toEqual(before);
    });

    it('commits nested writes and returns the callback result through the selected connection', async () => {
      const fixture = await createMutationFixture(context);
      const result = await context.database.transaction(async (connection) => {
        const created = await connection
          .repository('repositoryProjects')
          .createOne({
            values: {
              name: 'Committed',
              owner: { connect: { id: fixture.ada } },
              tasks: { create: { title: 'Committed task' } },
              tags: {
                connect: {
                  where: { id: fixture.databaseTag },
                  through: { role: 'owner' },
                },
              },
            },
          });
        const updated = await connection
          .repository('repositoryProjects')
          .updateOne({
            filter: { id: created.record.id as number },
            ifVersion: 1,
            values: { name: 'Final' },
          });
        return { id: created.record.id, version: updated.version };
      }, context.spec.name);
      expect(result.version).toBe(2);
      expect(
        await context
          .db(context.table('repositoryProjects'))
          .where({ id: result.id })
          .select('name', 'version'),
      ).toEqual([{ name: 'Final', version: 2 }]);
      expect(
        await context
          .db(context.table('repositoryTasks'))
          .where({ project_id: result.id })
          .select('title'),
      ).toEqual([{ title: 'Committed task' }]);
      expect(
        await context
          .db(context.table('repositoryProjectTags'))
          .where({ project_id: result.id })
          .select('role'),
      ).toEqual([{ role: 'owner' }]);
    });
  },
);
