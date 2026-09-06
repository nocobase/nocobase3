import { expect, it } from 'vitest';
import type {
  FilterBuilder,
  RepositoryFilter,
  RepositoryRecord,
} from '../../../../src/index.js';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createRelationFixture } from '../fixtures/relations.js';

describeIntegrationDatabases(
  'Repository nested Filter diagnostics',
  (context) => {
    it.each([undefined, null, false, [], {}].map((value) => [value]))(
      'rejects nested callback result %j before deleting parents',
      async (value) => {
        await createRelationFixture(context);
        const repository = context.database.repository('repositoryAuthors');
        const before = await context
          .db(context.table('repositoryAuthors'))
          .orderBy('id');
        const filter = (f: FilterBuilder) =>
          f.relation('books').some((() => value) as never);
        await expect(repository.findMany({ filter })).rejects.toMatchObject({
          code: 'INVALID_FILTER',
        });
        await expect(repository.deleteMany({ filter })).rejects.toMatchObject({
          code: 'INVALID_FILTER',
        });
        expect(
          await context.db(context.table('repositoryAuthors')).orderBy('id'),
        ).toEqual(before);
      },
    );

    it.each(
      [undefined, null, 1, [], {}, '', '$', 'viewer.amount'].map((value) => [
        value,
      ]),
    )(
      'rejects malformed variable path %j without native errors',
      async (path) => {
        await createRelationFixture(context);
        const repository = context.database.repository('repositoryAuthors');
        const filter = {
          kind: 'filter',
          version: 1,
          root: {
            kind: 'group',
            logic: 'and',
            items: [
              {
                kind: 'relation',
                path: ['books'],
                quantifier: 'some',
                filter: {
                  kind: 'group',
                  logic: 'and',
                  items: [
                    {
                      kind: 'condition',
                      path: ['pages'],
                      operator: '$gt',
                      value: { kind: 'variable', path },
                    },
                  ],
                },
              },
            ],
          },
        } as RepositoryFilter<RepositoryRecord>;
        const before = await context
          .db(context.table('repositoryAuthors'))
          .orderBy('id');
        await expect(
          repository.updateMany({ filter, values: { name: 'Forbidden' } }),
        ).rejects.toMatchObject({ code: 'INVALID_CONTEXT' });
        expect(
          await context.db(context.table('repositoryAuthors')).orderBy('id'),
        ).toEqual(before);
      },
    );

    it.each([
      null,
      false,
      { kind: 'condition' },
      { kind: 'group', logic: 'and', items: [null] },
    ])('rejects malformed nested relation filter %j', async (nested) => {
      await createRelationFixture(context);
      const repository = context.database.repository('repositoryAuthors');
      const filter = {
        kind: 'filter',
        version: 1,
        root: {
          kind: 'group',
          logic: 'and',
          items: [
            {
              kind: 'relation',
              path: ['books'],
              quantifier: 'some',
              filter: nested,
            },
          ],
        },
      } as unknown as RepositoryFilter<RepositoryRecord>;
      await expect(repository.findMany({ filter })).rejects.toMatchObject({
        code: 'INVALID_FILTER',
      });
    });
  },
);
