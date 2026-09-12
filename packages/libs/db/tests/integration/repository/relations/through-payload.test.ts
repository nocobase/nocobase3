import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createMutationFixture } from '../fixtures/mutations.js';

describeIntegrationDatabases(
  'Repository relations/through-payload',
  (context) => {
    it('writes through payloads without changing target records or managed keys', async () => {
      const fixture = await createMutationFixture(context);
      const projects = context.database.repository('repositoryProjects');
      const edges = context.database.repository('repositoryProjectTags');
      const first = await projects.createOne({
        values: {
          name: 'With payload',
          tags: (tags) =>
            tags
              .connect(
                { id: fixture.databaseTag },
                { through: { role: 'owner', weight: 2 } },
              )
              .create(
                { label: 'created-with-edge' },
                { through: { role: 'reader' } },
              ),
        },
      });
      const filter = { projectId: first.record.id as number };
      const payloads = async () =>
        edges.findMany({
          filter,
          select: (s) => s.fields('role', 'weight'),
          sort: (s) => [s.field('id').asc()],
        });
      expect(await payloads()).toEqual([
        { role: 'owner', weight: 2 },
        { role: 'reader', weight: 0 },
      ]);
      await projects.updateOne({
        filter: { id: first.record.id as number },
        values: {
          tags: {
            connect: {
              where: { id: fixture.databaseTag },
              through: { role: 'editor' },
            },
          },
        },
      });
      expect(await payloads()).toEqual([
        { role: 'editor', weight: 2 },
        { role: 'reader', weight: 0 },
      ]);
      await projects.updateOne({
        filter: { id: first.record.id as number },
        values: {
          tags: (tags) =>
            tags.set([
              { where: { id: fixture.databaseTag }, through: { weight: 3 } },
            ]),
        },
      });
      expect(await payloads()).toEqual([{ role: 'editor', weight: 3 }]);
      await projects.updateOne({
        filter: { id: first.record.id as number },
        values: { tags: { set: [{ id: fixture.databaseTag }] } },
      });
      expect(await payloads()).toEqual([{ role: 'editor', weight: 3 }]);
      await projects.updateOne({
        filter: { id: first.record.id as number },
        values: {
          tags: {
            create: {
              values: { label: 'json-edge' },
              through: { role: 'json' },
            },
          },
        },
      });
      expect(await payloads()).toEqual([
        { role: 'editor', weight: 3 },
        { role: 'json', weight: 0 },
      ]);
      for (const through of [
        { projectId: 999 },
        { tagId: 999 },
        { id: 999 },
        { unknown: true },
        { weight: { increment: 1 } },
      ]) {
        const invalid = await projects.validateMutation({
          operation: 'updateOne',
          filter: { id: first.record.id as number },
          values: {
            tags: { connect: { where: { id: fixture.databaseTag }, through } },
          },
        });
        expect(invalid.valid).toBe(false);
      }
      await expect(
        projects.updateOne({
          filter: { id: first.record.id as number },
          values: {
            owner: (owner) =>
              owner.connect({ id: fixture.ada }, { through: { role: 'bad' } }),
          },
        }),
      ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
      await expect(
        projects.updateOne({
          filter: { id: first.record.id as number },
          values: {
            tags: (tags) =>
              tags
                .connect(
                  { id: fixture.databaseTag },
                  { through: { role: 'rollback' } },
                )
                .connect({ id: -1 }),
          },
        }),
      ).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND' });
      expect((await payloads())[0]).toEqual({ role: 'editor', weight: 3 });
      const description = await projects.describeMutation({
        operation: 'updateOne',
      });
      expect(
        description.relations.find((r) => r.field === 'tags')?.through,
      ).toEqual({
        collection: 'repositoryProjectTags',
        writableFields: ['role', 'weight'],
        requiredOnCreate: [],
      });
      expect(
        await context.database
          .repository('repositoryTagsForMutation')
          .exists({ filter: { label: 'created-with-edge' } }),
      ).toBe(true);
    });
  },
);
