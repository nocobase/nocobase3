import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createMutationFixture } from '../fixtures/mutations.js';

describeIntegrationDatabases(
  'Repository relations/stream-validation',
  (context) => {
    it('validates nested selection before emitting root records', async () => {
      await createMutationFixture(context);
      const repository = context.database.repository('repositoryProjects');
      const stream = repository.findMany({
        select: (select) =>
          select
            .fields('id')
            .include('owner', (owner) => owner.fields('missing')),
      });

      await expect(async () => {
        for await (const _record of stream) {
          // Validation fails before a record is read.
        }
      }).rejects.toMatchObject({ code: 'FIELD_NOT_FOUND' });
    });
  },
);
