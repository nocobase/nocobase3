import { expect, it } from 'vitest';
import type { FilterAst } from '../../../../src/index.js';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createFilterFixture } from '../fixtures/filter.js';

describeIntegrationDatabases(
  'Repository Filter context boundaries',
  (context) => {
    it('resolves only own properties and does not invoke inherited getters', async () => {
      await createFilterFixture(context);
      let invoked = false;
      const inherited = Object.create({
        get amount() {
          invoked = true;
          return 0;
        },
      }) as Record<string, unknown>;
      const repository = context.database.repository('filterSamples');
      await expect(
        repository.findMany({
          filter: (f) => f.number('amount').eq(f.variable('$amount')),
          context: inherited,
        }),
      ).rejects.toMatchObject({ code: 'VARIABLE_NOT_FOUND' });
      await expect(
        repository.findMany({
          filter: (f) => f.number('amount').eq(f.variable('$search.amount')),
          context: { search: inherited },
        }),
      ).rejects.toMatchObject({ code: 'VARIABLE_NOT_FOUND' });
      expect(invoked).toBe(false);
      Object.defineProperty(inherited, 'amount', {
        value: 0,
        enumerable: true,
      });
      expect(
        await repository.findMany({
          filter: (f) => f.number('amount').eq(f.variable('$search.amount')),
          context: { search: inherited },
          select: (s) => s.fields('code'),
        }),
      ).toEqual([{ code: 'B' }]);
    });

    it('supports own data in null-prototype contexts without treating false as missing', async () => {
      await createFilterFixture(context);
      const input: Record<string, unknown> = Object.assign(
        Object.create(null),
        { selected: 'B', enabled: false },
      );
      const repository = context.database.repository('filterSamples');
      expect(
        await repository.findMany({
          filter: (f) => f.string('code').eq(f.variable('$selected')),
          context: input,
          select: (s) => s.fields('code'),
        }),
      ).toEqual([{ code: 'B' }]);
      // false is present, but is not a valid operand for numeric equality.
      await expect(
        repository.findMany({
          filter: (f) => f.number('amount').eq(f.variable('$enabled')),
          context: input,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_FILTER' });
    });

    it('isolates one frozen variable AST across simultaneous read calls', async () => {
      await createFilterFixture(context);
      const filter: FilterAst = {
        kind: 'filter',
        version: 1,
        root: {
          kind: 'group',
          logic: 'and',
          items: [
            {
              kind: 'condition',
              path: ['amount'],
              operator: '$eq',
              value: { kind: 'variable', path: '$amount' },
            },
          ],
        },
      };
      function freeze(value: unknown): void {
        if (value && typeof value === 'object') {
          Object.values(value).forEach(freeze);
          Object.freeze(value);
        }
      }
      freeze(filter);
      const before = JSON.stringify(filter);
      const repository = context.database.repository('filterSamples');
      const rows = await Promise.all(
        [-1, 0, 1, null].map((amount) =>
          repository.findMany({
            filter,
            context: { amount },
            select: (s) => s.fields('code'),
          }),
        ),
      );
      expect(rows).toEqual([
        [{ code: 'A' }],
        [{ code: 'B' }],
        [{ code: 'C' }],
        [{ code: 'D' }],
      ]);
      expect(JSON.stringify(filter)).toBe(before);
    });

    it('treats fields named kind/version/root/collection as shorthand when they are scalar values', async () => {
      await context.builder.createCollection('filterReservedFields', (c) => {
        c.string('key').primary().notNull();
        c.string('kind').notNull();
        c.integer('version').notNull();
        c.string('root').notNull();
        c.string('collection').notNull();
      });
      await context.db(context.table('filterReservedFields')).insert([
        { key: 'A', kind: 'filter', version: 1, root: 'one', collection: 'A' },
        { key: 'B', kind: 'filter', version: 1, root: 'two', collection: 'B' },
      ]);
      const repository = context.database.repository('filterReservedFields');
      expect(
        await repository.findMany({
          filter: { kind: 'filter', version: 1, root: 'one', collection: 'A' },
          select: (s) => s.fields('key'),
        }),
      ).toEqual([{ key: 'A' }]);
      expect(
        await repository.findMany({
          filter: {
            kind: 'filter',
            version: 1,
            collection: 'filterReservedFields',
            root: {
              kind: 'group',
              logic: 'and',
              items: [
                {
                  kind: 'condition',
                  path: ['root'],
                  operator: '$eq',
                  value: 'two',
                },
              ],
            },
          },
          select: (s) => s.fields('key'),
        }),
      ).toEqual([{ key: 'B' }]);
    });
  },
);
