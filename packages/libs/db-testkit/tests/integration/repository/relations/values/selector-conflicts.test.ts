import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../../helpers.js';
import { createMutationFixture } from '../../fixtures/mutations.js';

describeIntegrationDatabases(
  'Repository relation selector conflicts',
  (context) => {
    for (const relation of ['tasks', 'tags'] as const) {
      it.each(['connect', 'disconnect', 'set', 'connect-disconnect'] as const)(
        `${relation} rejects repeated/conflicting %s selectors`,
        async (operation) => {
          const fixture = await createMutationFixture(context);
          const id = (
            relation === 'tasks' ? fixture.implementTask : fixture.databaseTag
          ) as number;
          const repository = context.database.repository('repositoryProjects');
          const created = await repository.createOne({
            values: { name: 'Original', [relation]: { connect: { id } } },
          });
          const tables = [
            'repositoryProjects',
            'repositoryTasks',
            'repositoryTagsForMutation',
            'repositoryProjectTags',
          ];
          const before = await Promise.all(
            tables.map((t) => context.db(context.table(t)).orderBy('id')),
          );
          const action =
            operation === 'connect-disconnect'
              ? { connect: { id }, disconnect: { id } }
              : { [operation]: [{ id }, { id }] };
          const values = { name: 'Must not change', [relation]: action };
          expect(
            await repository.validateMutation({
              operation: 'updateOne',
              filter: { id: created.record.id as number },
              values,
            }),
          ).toMatchObject({
            valid: false,
            errors: [{ code: 'INVALID_MUTATION' }],
          });
          await expect(
            repository.updateOne({
              filter: { id: created.record.id as number },
              values,
            }),
          ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
          expect(
            await Promise.all(
              tables.map((t) => context.db(context.table(t)).orderBy('id')),
            ),
          ).toEqual(before);
        },
      );
    }

    it('rejects clientKey reuse across separate nested create branches before writes', async () => {
      await createMutationFixture(context);
      const tables = [
        'repositoryProjects',
        'repositoryTasks',
        'repositoryTagsForMutation',
        'repositoryProjectTags',
      ];
      const before = await Promise.all(
        tables.map((t) => context.db(context.table(t)).orderBy('id')),
      );
      await expect(
        context.database.repository('repositoryProjects').createOne({
          values: {
            name: 'Invalid',
            tasks: (t) =>
              t.create({ title: 'Temporary' }, { clientKey: 'same' }),
            tags: (t) =>
              t.create({ label: 'Temporary' }, { clientKey: 'same' }),
          },
        }),
      ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
      expect(
        await Promise.all(
          tables.map((t) => context.db(context.table(t)).orderBy('id')),
        ),
      ).toEqual(before);
    });
  },
);
