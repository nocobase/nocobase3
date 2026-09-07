import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createMutationFixture } from '../fixtures/mutations.js';

describeIntegrationDatabases('Repository relations/distinct', (context) => {
  it('loads relations for the representative distinct records', async () => {
    const fixture = await createMutationFixture(context);
    const repository = context.database.repository('repositoryProjects');
    await repository.createOne({
      values: {
        name: 'Shared name',
        owner: { connect: { id: fixture.ada } },
      },
    });
    const latest = await repository.createOne({
      values: {
        name: 'Shared name',
        owner: { connect: { id: fixture.bob } },
      },
      select: (select) => select.fields('id'),
    });

    await expect(
      repository.findMany({
        distinct: ['name'],
        sort: (sort) => sort.field('id').desc(),
        select: (select) =>
          select
            .fields('id', 'name')
            .include('owner', (owner) => owner.fields('name')),
      }),
    ).resolves.toEqual([
      {
        id: latest.record.id,
        name: 'Shared name',
        owner: { name: 'Bob' },
      },
    ]);

    await expect(
      repository.findMany({
        select: (select) =>
          select.include('owner', (owner) => owner.fields('id').limit(1)),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PAGINATION' });
    await expect(
      repository.findMany({
        select: (select) =>
          select.include('tasks', (tasks) =>
            tasks.fields('id').cursor({ id: 1 }).limit(1),
          ),
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_PAGINATION',
      path: ['sort'],
    });
  });
});
