import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createMutationFixture } from '../fixtures/mutations.js';

describeIntegrationDatabases(
  'Repository relations/stream-validation',
  (context) => {
    it('rejects relation includes in streaming root queries', async () => {
      await createMutationFixture(context);
      const repository = context.database.repository('repositoryProjects');
      const stream = repository.stream({
        select: (select) =>
          select.fields('id').include('owner', (owner) => owner.fields('name')),
      });

      await expect(async () => {
        for await (const _record of stream) {
          // Validation fails before a record is read.
        }
      }).rejects.toMatchObject({ code: 'INVALID_STREAM' });
    });
  },
);
