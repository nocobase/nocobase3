import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../../helpers.js';
import {
  createMutationFixture,
  projectSelection,
  selection,
  equalFilter,
} from '../../fixtures/mutations.js';

describeIntegrationDatabases(
  'Repository relations/values/nested-operations',
  (context) => {
    it('supports atomic nested update and upsert branches without escaping relation scope', async () => {
      const fixture = await createMutationFixture(context);
      const projects = context.database.repository('repositoryProjects');
      const project = await projects.createOne({
        values: {
          name: 'Atomic',
          tasks: { connect: { id: fixture.implementTask } },
        },
      });
      await projects.updateOne({
        filter: { id: project.record.id as number },
        values: {
          tasks: (tasks) =>
            tasks.update({
              filter: { id: fixture.implementTask as number },
              values: { points: (value) => value.increment(5) },
            }),
        },
      });
      await context.database.repository('repositoryTasks').updateOne({
        filter: { id: fixture.implementTask as number },
        values: { externalId: 'atomic-task' },
      });
      await projects.updateOne({
        filter: { id: project.record.id as number },
        values: {
          tasks: (tasks) =>
            tasks.upsert({
              filter: { externalId: 'atomic-task' },
              create: { externalId: 'atomic-task', title: 'Unused' },
              update: { points: { multiply: 2 } },
            }),
        },
      });
      expect(
        await context.database.repository('repositoryTasks').findOne({
          filter: { id: fixture.implementTask as number },
          select: (select) => select.fields('points'),
        }),
      ).toEqual({ points: 10 });
    });

    it('accepts Builder and JSON relation operations inside values recursively', async () => {
      const fixture = await createMutationFixture(context);
      const repository = context.database.repository('repositoryProjects');

      const created = await repository.createOne({
        values: {
          name: 'Model-shaped create',
          metadata: { connect: 'ordinary JSON data' },
          owner: (owner) => owner.connect({ id: fixture.ada }),
          profile: { connect: { id: fixture.profile } },
          tasks: (tasks) =>
            tasks.create({
              title: 'Nested task',
              assignee: (assignee) => assignee.connect({ id: fixture.bob }),
            }),
          tags: {
            create: { label: 'model-shaped' },
            connect: { id: fixture.databaseTag },
          },
        },
        select: projectSelection(),
      });

      expect(created.record).toMatchObject({
        name: 'Model-shaped create',
        owner: { name: 'Ada' },
        profile: { summary: 'Primary project' },
        tasks: [{ title: 'Nested task', assignee: { name: 'Bob' } }],
        tags: [{ label: 'database' }, { label: 'model-shaped' }],
      });
      expect(
        typeof created.record.metadata === 'string'
          ? JSON.parse(created.record.metadata)
          : created.record.metadata,
      ).toEqual({ connect: 'ordinary JSON data' });
    });

    it('updates relations with mixed JSON and Builder values operations', async () => {
      const fixture = await createMutationFixture(context);
      const repository = context.database.repository('repositoryProjects');
      const first = await repository.createOne({
        values: {
          name: 'Before update',
          owner: { connect: { id: fixture.ada } },
          profile: { connect: { id: fixture.profile } },
          tasks: { connect: { id: fixture.implementTask } },
          tags: { connect: { id: fixture.databaseTag } },
        },
        select: selection(['id']),
      });

      const updated = await repository.updateOne({
        filter: { id: first.record.id as number },
        ifVersion: 1,
        values: {
          name: 'After update',
          owner: { connect: { id: fixture.bob } },
          profile: (profile) => profile.disconnect(),
          tasks: {
            connect: [{ id: fixture.reviewTask }],
            disconnect: [{ id: fixture.implementTask }],
          },
          tags: { set: [{ id: fixture.typescriptTag }] },
        },
        select: projectSelection(),
      });

      expect(updated).toMatchObject({
        record: {
          name: 'After update',
          owner: { name: 'Bob' },
          profile: null,
          tasks: [{ title: 'Review' }],
          tags: [{ label: 'typescript' }],
        },
        version: 2,
      });
    });

    it('rejects conflicting model-shaped relation operations', async () => {
      const fixture = await createMutationFixture(context);
      const repository = context.database.repository('repositoryProjects');

      await expect(
        repository.updateOne({
          filter: (filter) =>
            filter.number('id').eq(fixture.implementTask as number),
          values: {
            tags: (tags) =>
              tags
                .set([{ id: fixture.databaseTag }])
                .connect({ id: fixture.typescriptTag }),
          },
        }),
      ).rejects.toMatchObject({ code: 'INVALID_MUTATION', relation: 'tags' });

      await expect(
        repository.createOne({
          values: {
            name: 'Invalid create',
            tags: { disconnect: true } as never,
          },
        }),
      ).rejects.toMatchObject({ code: 'RELATION_ACTION_NOT_ALLOWED' });
    });

    it('updates, upserts, and deletes targets inside the current relation scope', async () => {
      const fixture = await createMutationFixture(context);
      const repository = context.database.repository('repositoryProjects');
      const first = await repository.createOne({
        values: {
          name: 'Target mutations',
          profile: { connect: { id: fixture.profile } },
          tasks: {
            connect: [
              { id: fixture.implementTask },
              { id: fixture.reviewTask },
            ],
          },
          tags: { connect: { id: fixture.databaseTag } },
        },
        select: selection(['id']),
      });

      const updated = await repository.updateOne({
        filter: (filter) => filter.number('id').eq(first.record.id as number),
        values: {
          profile: (profile) =>
            profile.update({ values: { summary: 'Updated profile' } }),
          tasks: (tasks) =>
            tasks
              .update({
                filter: { id: fixture.implementTask as number },
                values: {
                  title: 'Implemented',
                  assignee: { connect: { id: fixture.bob } },
                },
              })
              .upsert({
                filter: { externalId: 'task-imported' },
                create: {
                  externalId: 'task-imported',
                  title: 'Imported task',
                },
                update: { title: 'Updated imported task' },
              })
              .delete({
                filter: { id: fixture.reviewTask as number },
              }),
          tags: {
            update: {
              filter: { label: 'database' },
              values: { label: 'database-updated' },
            },
          },
        },
        select: projectSelection(),
      });

      expect(updated.record).toMatchObject({
        profile: { summary: 'Updated profile' },
        tasks: [
          { title: 'Implemented', assignee: { name: 'Bob' } },
          { title: 'Imported task', assignee: null },
        ],
        tags: [{ label: 'database-updated' }],
      });
      await expect(
        context.database.repository('repositoryTasks').findOne({
          filter: (filter) =>
            filter.number('id').eq(fixture.reviewTask as number),
        }),
      ).resolves.toBeUndefined();

      await repository.updateOne({
        filter: (filter) => filter.number('id').eq(first.record.id as number),
        values: {
          tasks: {
            upsert: {
              filter: { externalId: 'task-imported' },
              create: {
                externalId: 'task-imported',
                title: 'Should not be created',
              },
              update: { title: 'Updated imported task' },
            },
          },
        },
      });
      const afterUpsert = await repository.findOne({
        filter: (filter) => filter.number('id').eq(first.record.id as number),
        select: projectSelection(),
      });
      expect(afterUpsert?.tasks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: 'Updated imported task' }),
        ]),
      );

      await expect(
        repository.updateOne({
          filter: (filter) => filter.number('id').eq(first.record.id as number),
          values: {
            tasks: {
              update: {
                filter: (filter) => filter.string('title').notEmpty(),
                values: { title: 'Ambiguous' },
              },
            },
          },
        }),
      ).rejects.toMatchObject({ code: 'MULTIPLE_RELATION_TARGETS_MATCHED' });

      await context.database.repository('repositoryTasks').createOne({
        values: {
          externalId: 'outside-task',
          title: 'Outside relation scope',
        },
      });
      await expect(
        repository.updateOne({
          filter: (filter) => filter.number('id').eq(first.record.id as number),
          values: {
            tasks: {
              upsert: {
                filter: equalFilter('externalId', 'outside-task'),
                create: {
                  externalId: 'outside-task',
                  title: 'Duplicate outside task',
                },
                update: { title: 'Must stay outside' },
              },
            },
          },
        }),
      ).rejects.toMatchObject({ code: 'RELATION_UPSERT_TARGET_OUTSIDE_SCOPE' });

      await repository.updateOne({
        filter: (filter) => filter.number('id').eq(first.record.id as number),
        values: {
          tags: {
            delete: { filter: { label: 'database-updated' } },
          },
        },
      });
      await expect(
        context.database.repository('repositoryTagsForMutation').findOne({
          filter: (filter) => filter.string('label').eq('database-updated'),
        }),
      ).resolves.toBeUndefined();
      await expect(
        context.database.repository('repositoryProjectTags').count(),
      ).resolves.toBe(0);

      await repository.updateOne({
        filter: (filter) => filter.number('id').eq(first.record.id as number),
        values: { profile: (profile) => profile.delete() },
      });
      await expect(
        repository.findOne({
          filter: (filter) => filter.number('id').eq(first.record.id as number),
          select: projectSelection(),
        }),
      ).resolves.toMatchObject({ profile: null });
    });

    it('creates a root with connected, created, and nested relation targets', async () => {
      const fixture = await createMutationFixture(context);
      const repository = context.database.repository('repositoryProjects');

      const created = await repository.createOne({
        values: {
          name: 'Repository',
          owner: (owner) => owner.connect({ id: fixture.ada }),
          profile: (profile) => profile.connect({ id: fixture.profile }),
          tasks: (tasks) =>
            tasks.create(
              {
                title: 'Implement',
                assignee: (assignee) => assignee.connect({ id: fixture.bob }),
              },
              { clientKey: 'task-local' },
            ),
          tags: (tags) =>
            tags
              .connect({ id: fixture.databaseTag })
              .create({ label: 'runtime' }, { clientKey: 'tag-local' }),
        },
        select: projectSelection(),
      });

      expect(created).toMatchObject({
        record: {
          name: 'Repository',
          owner: { name: 'Ada' },
          profile: { summary: 'Primary project' },
          tasks: [{ title: 'Implement', assignee: { name: 'Bob' } }],
          tags: [{ label: 'database' }, { label: 'runtime' }],
        },
        createdTargets: [
          {
            clientKey: 'task-local',
            collection: 'repositoryTasks',
            unique: { kind: 'unique', fields: ['id'] },
          },
          {
            clientKey: 'tag-local',
            collection: 'repositoryTagsForMutation',
            unique: { kind: 'unique', fields: ['id'] },
          },
        ],
        version: 1,
      });
    });

    it('patches and replaces relations atomically while advancing root version', async () => {
      const fixture = await createMutationFixture(context);
      const repository = context.database.repository('repositoryProjects');
      const first = await repository.createOne({
        values: {
          name: 'Repository',
          owner: { connect: { id: fixture.ada } },
          profile: { connect: { id: fixture.profile } },
          tasks: { connect: { id: fixture.implementTask } },
          tags: { connect: { id: fixture.databaseTag } },
        },
        select: selection(['id']),
      });

      const updated = await repository.updateOne({
        filter: (filter) => filter.number('id').eq(first.record.id as number),
        ifVersion: 1,
        values: {
          owner: { connect: { id: fixture.bob } },
          profile: { disconnect: true },
          tasks: {
            connect: { id: fixture.reviewTask },
            disconnect: { id: fixture.implementTask },
          },
          tags: { set: [{ id: fixture.typescriptTag }] },
        },
        select: projectSelection(),
      });

      expect(updated).toMatchObject({
        record: {
          owner: { name: 'Bob' },
          profile: null,
          tasks: [{ title: 'Review', assignee: null }],
          tags: [{ label: 'typescript' }],
        },
        createdTargets: [],
        version: 2,
      });
      await expect(
        repository.updateOne({
          filter: (filter) => filter.number('id').eq(first.record.id as number),
          ifVersion: 1,
          values: { tags: { set: [{ id: fixture.databaseTag }] } },
        }),
      ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
      await expect(
        repository.findOne({
          filter: (filter) => filter.number('id').eq(first.record.id as number),
          select: projectSelection(),
        }),
      ).resolves.toMatchObject({
        owner: { name: 'Bob' },
        profile: null,
        tasks: [{ title: 'Review' }],
        tags: [{ label: 'typescript' }],
        version: 2,
      });
    });
  },
);
