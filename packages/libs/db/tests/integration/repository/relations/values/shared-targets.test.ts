import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../../helpers.js';
import { createMutationFixture } from '../../fixtures/mutations.js';

describeIntegrationDatabases(
  'Repository shared relation targets',
  (context) => {
    it('updates one edge payload and disconnects it without changing the shared target or other edge', async () => {
      const fixture = await createMutationFixture(context);
      const id = fixture.databaseTag as number;
      const projects = context.database.repository('repositoryProjects');
      const first = await projects.createOne({
        values: {
          name: 'First',
          tags: { connect: { where: { id }, through: { role: 'owner' } } },
        },
      });
      const second = await projects.createOne({
        values: {
          name: 'Second',
          tags: { connect: { where: { id }, through: { role: 'reader' } } },
        },
      });
      const edgeTable = context.table('repositoryProjectTags');
      const targetTable = context.table('repositoryTagsForMutation');
      const otherBefore = await context
        .db(edgeTable)
        .where({ project_id: second.record.id });
      const targetsBefore = await context.db(targetTable).orderBy('id');
      for (let repeat = 0; repeat < 2; repeat += 1) {
        await projects.updateOne({
          filter: { id: first.record.id as number },
          values: {
            tags: { connect: { where: { id }, through: { role: 'editor' } } },
          },
        });
      }
      expect(
        await context
          .db(edgeTable)
          .where({ project_id: first.record.id })
          .select('role'),
      ).toEqual([{ role: 'editor' }]);
      expect(
        await context.db(edgeTable).where({ project_id: second.record.id }),
      ).toEqual(otherBefore);
      await projects.updateOne({
        filter: { id: first.record.id as number },
        values: { tags: { set: [] } },
      });
      expect(
        await context.db(edgeTable).where({ project_id: first.record.id }),
      ).toEqual([]);
      expect(
        await context.db(edgeTable).where({ project_id: second.record.id }),
      ).toEqual(otherBefore);
      expect(await context.db(targetTable).orderBy('id')).toEqual(
        targetsBefore,
      );
    });

    it('rolls back root changes, newly created targets and edge payload after a later connect fails', async () => {
      const fixture = await createMutationFixture(context);
      const projects = context.database.repository('repositoryProjects');
      const created = await projects.createOne({
        values: {
          name: 'Before',
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
        'repositoryTasks',
        'repositoryTagsForMutation',
        'repositoryProjectTags',
      ];
      const before = await Promise.all(
        tables.map((table) => context.db(context.table(table)).orderBy('id')),
      );
      await expect(
        projects.updateOne({
          filter: { id: created.record.id as number },
          ifVersion: 1,
          values: {
            name: 'Must roll back',
            tasks: { create: { title: 'Temporary' } },
            tags: (t) =>
              t
                .connect(
                  { id: fixture.databaseTag },
                  { through: { role: 'changed' } },
                )
                .create({ label: 'temporary' })
                .connect({ id: -1 }),
          },
        }),
      ).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND' });
      const after = await Promise.all(
        tables.map((table) => context.db(context.table(table)).orderBy('id')),
      );
      expect(after).toEqual(before);
    });
  },
);
