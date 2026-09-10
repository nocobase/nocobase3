import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../../helpers.js';
import { createMutationFixture } from '../../fixtures/mutations.js';

describeIntegrationDatabases(
  'Repository relation disconnect and delete',
  (context) => {
    const cases = [
      { relation: 'owner', table: 'repositoryUsers', key: 'ada' },
      {
        relation: 'profile',
        table: 'repositoryProjectProfiles',
        key: 'profile',
      },
      { relation: 'tasks', table: 'repositoryTasks', key: 'implementTask' },
      {
        relation: 'tags',
        table: 'repositoryTagsForMutation',
        key: 'databaseTag',
      },
    ] as const;

    for (const operation of ['disconnect', 'delete'] as const) {
      it.each(cases)(
        `$relation ${operation} has the correct target lifetime`,
        async (c) => {
          const fixture = await createMutationFixture(context);
          const id = fixture[c.key] as number;
          const projects = context.database.repository('repositoryProjects');
          const created = await projects.createOne({
            values: { name: 'Root', [c.relation]: { connect: { id } } },
          });
          const othersBefore = await context
            .db(context.table(c.table))
            .whereNot({ id })
            .orderBy('id');
          const toMany = c.relation === 'tasks' || c.relation === 'tags';
          const action =
            operation === 'disconnect'
              ? { disconnect: toMany ? { id } : true }
              : { delete: toMany ? { filter: { id } } : {} };
          const result = await projects.updateOne({
            filter: { id: created.record.id as number },
            values: { [c.relation]: action },
            select: (s) => s.fields('name').include(c.relation),
          });
          expect(result.record[c.relation]).toEqual(toMany ? [] : null);
          const target = await context.db(context.table(c.table)).where({ id });
          expect(target).toHaveLength(operation === 'delete' ? 0 : 1);
          expect(
            await context
              .db(context.table(c.table))
              .whereNot({ id })
              .orderBy('id'),
          ).toEqual(othersBefore);
          if (c.relation === 'tags')
            expect(
              await context.db(context.table('repositoryProjectTags')),
            ).toEqual([]);
          if (
            operation === 'disconnect' &&
            (c.relation === 'profile' || c.relation === 'tasks')
          )
            expect(target[0].project_id).toBeNull();
          if (c.relation === 'owner') {
            const row = await context
              .db(context.table('repositoryProjects'))
              .where({ id: created.record.id })
              .first();
            expect(row.owner_id).toBeNull();
          }
        },
      );
    }

    it.each(['owner', 'profile', 'tasks', 'tags'] as const)(
      '%s nested create returns only its requested projection',
      async (relation) => {
        await createMutationFixture(context);
        const values =
          relation === 'owner'
            ? { name: 'Nested', email: 'nested@example.com' }
            : relation === 'profile'
              ? { summary: 'Nested' }
              : relation === 'tasks'
                ? { title: 'Nested' }
                : { label: 'Nested' };
        const field = Object.keys(values)[0];
        const result = await context.database
          .repository('repositoryProjects')
          .createOne({
            values: { name: 'Root', [relation]: { create: values } },
            select: (s) =>
              s.fields('name').include(relation, (r) => r.fields(field)),
          });
        expect(result.record).toEqual({
          name: 'Root',
          [relation]:
            relation === 'tasks' || relation === 'tags'
              ? [{ [field]: 'Nested' }]
              : { [field]: 'Nested' },
        });
      },
    );
  },
);
