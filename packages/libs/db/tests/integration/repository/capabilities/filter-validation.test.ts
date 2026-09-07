import { expect, it } from 'vitest';
import type {
  RepositoryFilter,
  RepositoryRecord,
} from '../../../../src/index.js';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createFilterFixture } from '../fixtures/filter.js';
import { createRelationFixture } from '../fixtures/relations.js';

function ast(root: unknown): unknown {
  return { kind: 'filter', version: 1, root };
}
function group(node: unknown): unknown {
  return ast({ kind: 'group', logic: 'and', items: [node] });
}
const malformed: readonly [string, unknown][] = [
  ['null', null],
  ['array input', []],
  ['callback without return', () => undefined],
  [
    'wrong version',
    {
      kind: 'filter',
      version: 2,
      root: { kind: 'group', logic: 'and', items: [] },
    },
  ],
  [
    'wrong collection',
    {
      kind: 'filter',
      version: 1,
      collection: 'other',
      root: { kind: 'group', logic: 'and', items: [] },
    },
  ],
  ['null root', ast(null)],
  ['missing items', ast({ kind: 'group', logic: 'and' })],
  ['object items', ast({ kind: 'group', logic: 'and', items: {} })],
  ['invalid logic', ast({ kind: 'group', logic: 'xor', items: [] })],
  ['null node', group(null)],
  [
    'unknown node kind',
    group({ kind: 'other', path: ['amount'], operator: '$eq', value: 0 }),
  ],
  ['missing path', group({ kind: 'condition', operator: '$eq', value: 0 })],
  [
    'string path',
    group({ kind: 'condition', path: 'amount', operator: '$eq', value: 0 }),
  ],
  [
    'empty path',
    group({ kind: 'condition', path: [], operator: '$eq', value: 0 }),
  ],
  [
    'non-string path segment',
    group({ kind: 'condition', path: [null], operator: '$eq', value: 0 }),
  ],
  [
    'empty path segment',
    group({ kind: 'condition', path: [''], operator: '$eq', value: 0 }),
  ],
  [
    'nested malformed group',
    group({ kind: 'group', logic: 'and', items: null }),
  ],
];

describeIntegrationDatabases(
  'Repository Filter validation safety',
  (context) => {
    it.each(['unknown', null, undefined])(
      'rejects invalid relation quantifier %j without deleting parents',
      async (quantifier) => {
        await createRelationFixture(context);
        const repository = context.database.repository('repositoryBooks');
        const before = await context
          .db(context.table('repositoryBooks'))
          .orderBy('id');
        const filter = group({
          kind: 'relation',
          path: ['tags'],
          quantifier,
        }) as RepositoryFilter<RepositoryRecord>;
        await expect(repository.findMany({ filter })).rejects.toMatchObject({
          code: 'INVALID_FILTER',
        });
        await expect(repository.deleteMany({ filter })).rejects.toMatchObject({
          code: 'INVALID_FILTER',
        });
        expect(
          await context.db(context.table('repositoryBooks')).orderBy('id'),
        ).toEqual(before);
      },
    );
    it.each(malformed)(
      'rejects %s before querying or changing the write scope',
      async (_name, input) => {
        await createFilterFixture(context);
        const repository = context.database.repository('filterSamples');
        const filter = input as RepositoryFilter<RepositoryRecord>;
        const before = await context
          .db(context.table('filterSamples'))
          .orderBy('code');
        await expect(repository.findMany({ filter })).rejects.toMatchObject({
          code: 'INVALID_FILTER',
        });
        await expect(
          repository.updateMany({ filter, values: { label: 'Forbidden' } }),
        ).rejects.toMatchObject({ code: 'INVALID_FILTER' });
        await expect(repository.deleteMany({ filter })).rejects.toMatchObject({
          code: 'INVALID_FILTER',
        });
        expect(
          await context.db(context.table('filterSamples')).orderBy('code'),
        ).toEqual(before);
      },
    );

    it.each([NaN, Infinity, -Infinity, '0', {}, undefined])(
      'rejects invalid numeric operand %j before writes',
      async (value) => {
        await createFilterFixture(context);
        const repository = context.database.repository('filterSamples');
        const filter = group({
          kind: 'condition',
          path: ['amount'],
          operator: '$eq',
          value,
        }) as RepositoryFilter<RepositoryRecord>;
        const before = await context
          .db(context.table('filterSamples'))
          .orderBy('code');
        await expect(
          repository.updateMany({ filter, values: { label: 'Forbidden' } }),
        ).rejects.toMatchObject({
          code: 'INVALID_FILTER',
          path: ['root', 'items', 0, 'value'],
        });
        expect(
          await context.db(context.table('filterSamples')).orderBy('code'),
        ).toEqual(before);
      },
    );
  },
);
