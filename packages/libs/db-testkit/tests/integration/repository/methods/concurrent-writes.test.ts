import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createDocumentationFixture } from '../fixtures/documentation.js';

describeIntegrationDatabases(
  'Repository concurrent write invariants',
  (context) => {
    it('permits only one writer with the same observed optimistic version', async () => {
      await createDocumentationFixture(context);
      const projects = context.database.repository('projects');
      await projects.createOne({ values: { id: 'A', name: 'Initial' } });
      const observed = await projects.findOne({ filter: { id: 'A' } });
      const results = await Promise.allSettled(
        ['First', 'Second'].map((name) =>
          projects.updateOne({
            filter: { id: 'A' },
            ifVersion: observed!.version as number,
            values: { name },
            select: (s) => s.fields('name', 'version'),
          }),
        ),
      );
      const successes = results.filter(
        (result) => result.status === 'fulfilled',
      );
      const failures = results.filter((result) => result.status === 'rejected');
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(failures[0]!.reason).toMatchObject({ code: 'VERSION_CONFLICT' });
      const winner = successes[0]!.value.record;
      expect(winner.version).toBe(2);
      expect(
        await context.db(context.table('projects')).select('name', 'version'),
      ).toEqual([winner]);
    });

    it('preserves unique identity when two create calls compete without promising driver error wording', async () => {
      await createDocumentationFixture(context);
      const tasks = context.database.repository('tasks');
      const results = await Promise.allSettled(
        ['First', 'Second'].map((title) =>
          tasks.createOne({ values: { id: 'A', title } }),
        ),
      );
      const successes = results.filter(
        (result) => result.status === 'fulfilled',
      );
      expect(successes).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
      expect(
        await context.db(context.table('tasks')).select('id', 'title'),
      ).toEqual([{ id: 'A', title: successes[0]!.value.record.title }]);
    });
  },
);
