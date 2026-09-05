import { expect, it } from 'vitest';
import type {
  RepositoryRecord,
  RepositorySelect,
  SelectAst,
} from '../../../src/index.js';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('Repository create context', (context) => {
  const ast: SelectAst = {
    kind: 'select',
    version: 1,
    root: {
      kind: 'selection',
      fields: ['taskCode', 'title'],
      includes: [
        {
          kind: 'include',
          relation: 'owner',
          select: { kind: 'selection', fields: ['accountCode'] },
          filter: {
            kind: 'filter',
            version: 1,
            root: {
              kind: 'group',
              logic: 'and',
              items: [
                {
                  kind: 'condition',
                  path: ['accountCode'],
                  operator: '$eq',
                  value: { kind: 'variable', path: '$viewer.accountCode' },
                },
              ],
            },
          },
        },
      ],
    },
  };
  const builder: RepositorySelect<RepositoryRecord> = (s) =>
    s
      .fields('taskCode', 'title')
      .include('owner', (owner) =>
        owner
          .fields('accountCode')
          .filter((f) =>
            f.string('accountCode').eq(f.variable('$viewer.accountCode')),
          ),
      );

  it.each(['builder', 'ast'] as const)(
    'resolves %s returning variables without changing persisted values',
    async (style) => {
      await context.builder.createCollections([
        {
          name: 'contextAccounts',
          definition: (c) => {
            c.string('accountCode').primary().notNull();
          },
        },
        {
          name: 'contextTasks',
          definition: (c) => {
            c.string('taskCode').primary().notNull();
            c.string('title').notNull();
            c.string('ownerCode').notNull();
            c.belongsTo('owner', 'contextAccounts')
              .foreignKey('ownerCode')
              .targetKey('accountCode');
          },
        },
      ]);
      await context.database.repository('contextAccounts').createMany({
        values: [{ accountCode: 'A' }, { accountCode: 'B' }],
      });
      const tasks = context.database.repository('contextTasks');
      const select = style === 'builder' ? builder : ast;
      const inputContext = Object.freeze({
        viewer: Object.freeze({ accountCode: 'A' }),
        title: 'Not a default',
      });
      for (const [taskCode, ownerCode] of [
        ['one-a', 'A'],
        ['one-b', 'B'],
      ]) {
        const result = await tasks.createOne({
          values: { taskCode, title: 'Explicit', ownerCode },
          select,
          context: inputContext,
        });
        expect(result.record).toEqual({
          taskCode,
          title: 'Explicit',
          owner: ownerCode === 'A' ? { accountCode: 'A' } : null,
        });
      }
      expect(
        await tasks.createMany({
          values: [
            { taskCode: 'many-a', title: 'Explicit', ownerCode: 'A' },
            { taskCode: 'many-b', title: 'Explicit', ownerCode: 'B' },
          ],
          select,
          context: inputContext,
        }),
      ).toEqual({
        createdCount: 2,
        records: [
          {
            taskCode: 'many-a',
            title: 'Explicit',
            owner: { accountCode: 'A' },
          },
          { taskCode: 'many-b', title: 'Explicit', owner: null },
        ],
      });
      expect(
        await tasks.findOne({ filter: { taskCode: 'many-b' } }),
      ).toMatchObject({ ownerCode: 'B', title: 'Explicit' });

      // Reusing the same selection must not retain an earlier context.
      expect(
        (
          await tasks.createOne({
            values: {
              taskCode: 'other-context',
              title: 'Explicit',
              ownerCode: 'B',
            },
            select,
            context: { viewer: { accountCode: 'B' } },
          })
        ).record.owner,
      ).toEqual({ accountCode: 'B' });

      for (const invalidContext of [
        undefined,
        { viewer: { accountCode: 42 } },
      ]) {
        const error = {
          code: invalidContext ? 'INVALID_FILTER' : 'VARIABLE_NOT_FOUND',
        };
        await expect(
          tasks.createOne({
            values: {
              taskCode: 'invalid-one',
              title: 'Explicit',
              ownerCode: 'A',
            },
            select,
            context: invalidContext,
          }),
        ).rejects.toMatchObject(error);
        await expect(
          tasks.createMany({
            values: [
              { taskCode: 'invalid-many', title: 'Explicit', ownerCode: 'A' },
            ],
            select,
            context: invalidContext,
          }),
        ).rejects.toMatchObject(error);
        expect(await tasks.count()).toBe(5);
      }
      expect(
        await tasks.createMany({
          values: [
            { taskCode: 'no-select', title: 'Explicit', ownerCode: 'A' },
          ],
          context: inputContext,
        }),
      ).toEqual({ createdCount: 1 });
    },
  );
});
