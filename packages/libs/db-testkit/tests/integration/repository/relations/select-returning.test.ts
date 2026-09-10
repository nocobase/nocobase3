import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createMutationFixture } from '../fixtures/mutations.js';

describeIntegrationDatabases(
  'Repository relations/select-returning',
  (context) => {
    it('supports Select Builder input for createOne() and updateOne()', async () => {
      const fixture = await createMutationFixture(context);
      const repository = context.database.repository('repositoryProjects');
      const created = await repository.createOne({
        values: {
          name: 'Builder selection',
          owner: { connect: { id: fixture.ada } },
        },
        select: (select) =>
          select
            .fields('id', 'name')
            .include('owner', (owner) => owner.fields('name')),
      });

      expect(created.record).toMatchObject({
        name: 'Builder selection',
        owner: { name: 'Ada' },
      });

      const updated = await repository.updateOne({
        filter: { id: created.record.id as number },
        values: { name: 'Updated selection' },
        select: (select) => select.fields('name'),
      });

      expect(updated.record).toEqual({ name: 'Updated selection' });

      await expect(
        repository.deleteOne({
          filter: { id: created.record.id as number },
          select: (select) =>
            select
              .fields('id', 'name')
              .include('owner', (owner) => owner.fields('name')),
        }),
      ).resolves.toEqual({
        deleted: true,
        record: {
          id: created.record.id,
          name: 'Updated selection',
          owner: { name: 'Ada' },
        },
      });
    });

    it('returns relation selections from bulk update and delete', async () => {
      const fixture = await createMutationFixture(context);
      const repository = context.database.repository('repositoryProjects');
      const first = await repository.createOne({
        values: {
          name: 'First bulk project',
          owner: { connect: { id: fixture.ada } },
        },
        select: (select) => select.fields('id'),
      });
      const second = await repository.createOne({
        values: {
          name: 'Second bulk project',
          owner: { connect: { id: fixture.bob } },
        },
        select: (select) => select.fields('id'),
      });

      const updated = await repository.updateMany({
        all: true,
        values: { name: 'Bulk updated' },
        select: (select) =>
          select
            .fields('id', 'name')
            .include('owner', (owner) => owner.fields('name')),
      });
      expect(updated).toEqual({
        updatedCount: 2,
        records: [
          {
            id: first.record.id,
            name: 'Bulk updated',
            owner: { name: 'Ada' },
          },
          {
            id: second.record.id,
            name: 'Bulk updated',
            owner: { name: 'Bob' },
          },
        ],
      });

      await expect(
        repository.deleteMany({
          all: true,
          select: (select) =>
            select
              .fields('id', 'name')
              .include('owner', (owner) => owner.fields('name')),
        }),
      ).resolves.toEqual({
        deletedCount: 2,
        records: updated.records,
      });
    });
  },
);
