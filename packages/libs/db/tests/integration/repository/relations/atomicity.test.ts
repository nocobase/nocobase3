import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createMutationFixture, selection } from '../fixtures/mutations.js';

describeIntegrationDatabases('Repository relations/atomicity', (context) => {
  it('rejects implicit reassignment and rolls the complete transaction back', async () => {
    const fixture = await createMutationFixture(context);
    const repository = context.database.repository('repositoryProjects');
    const first = await repository.createOne({
      values: {
        name: 'First',
        tasks: { connect: { id: fixture.implementTask } },
      },
      select: selection(['id']),
    });
    await repository.createOne({
      values: {
        name: 'Second',
        tasks: { connect: { id: fixture.reviewTask } },
      },
    });

    await expect(
      repository.updateOne({
        filter: (filter) => filter.number('id').eq(first.record.id as number),
        ifVersion: 1,
        values: {
          name: 'Should roll back',
          tasks: { connect: { id: fixture.reviewTask } },
        },
      }),
    ).rejects.toMatchObject({ code: 'RELATION_REASSIGNMENT_REQUIRED' });
    await expect(
      repository.findOne({
        filter: (filter) => filter.number('id').eq(first.record.id as number),
      }),
    ).resolves.toMatchObject({ name: 'First', version: 1 });
  });
});
