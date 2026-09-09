import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createMutationFixture } from '../fixtures/mutations.js';

describeIntegrationDatabases(
  'Repository relations/aggregate-filter',
  (context) => {
    it('applies relation filters to root aggregates', async () => {
      const fixture = await createMutationFixture(context);
      const repository = context.database.repository('repositoryProjects');
      await repository.createOne({
        values: {
          name: 'Ada project',
          owner: { connect: { id: fixture.ada } },
        },
      });
      await repository.createOne({
        values: {
          name: 'Bob project',
          owner: { connect: { id: fixture.bob } },
        },
      });

      await expect(
        repository.aggregate({
          filter: (filter) => filter.string('owner.name').eq('Ada'),
          aggregate: (aggregate) => ({
            count: aggregate.count(),
            maximumName: aggregate.max('name'),
          }),
        }),
      ).resolves.toEqual({ count: 1, maximumName: 'Ada project' });
    });
  },
);
