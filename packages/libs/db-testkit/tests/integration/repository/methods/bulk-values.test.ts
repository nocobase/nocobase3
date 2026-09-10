import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createMutationFixture } from '../fixtures/mutations.js';

describeIntegrationDatabases('Repository methods/bulk-values', (context) => {
  it('keeps bulk mutation values scalar-only', async () => {
    const fixture = await createMutationFixture(context);
    const repository = context.database.repository('repositoryProjects');

    await expect(
      repository.createMany({
        values: [
          {
            name: 'Invalid bulk create',
            owner: { connect: { id: fixture.ada } } as never,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'FIELD_NOT_WRITABLE', field: 'owner' });

    await expect(
      repository.updateMany({
        all: true,
        values: {
          tasks: { connect: { id: fixture.implementTask } } as never,
        },
      }),
    ).rejects.toMatchObject({ code: 'FIELD_NOT_WRITABLE', field: 'tasks' });
  });
});
