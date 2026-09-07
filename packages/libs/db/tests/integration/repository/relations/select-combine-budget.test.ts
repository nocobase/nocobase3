import { expect, it } from 'vitest';
import type {
  RelationSelectBranchNode,
  SelectAst,
  SelectNode,
} from '../../../../src/index.js';
import { describeIntegrationDatabases } from '../../helpers.js';

function countBranch(): RelationSelectBranchNode {
  return { select: { kind: 'selection' }, result: { kind: 'count' } };
}

function nestedBranch(levels: number): RelationSelectBranchNode {
  return levels === 0
    ? countBranch()
    : {
        select: { kind: 'selection' },
        result: {
          kind: 'combine',
          branches: { nested: nestedBranch(levels - 1) },
        },
      };
}

function withChildren(
  branch: RelationSelectBranchNode,
  extra?: SelectNode,
): SelectAst {
  return {
    kind: 'select',
    version: 1,
    root: {
      kind: 'selection',
      fields: ['code'],
      includes: [
        { kind: 'include', relation: 'children', ...branch },
        ...(extra
          ? [{ kind: 'include' as const, relation: 'next', select: extra }]
          : []),
      ],
    },
  };
}

function wideBranch(): RelationSelectBranchNode {
  return {
    select: { kind: 'selection' },
    result: {
      kind: 'combine',
      branches: Object.fromEntries(
        [32, 32, 31].map((count, group) => [
          `group${group}`,
          {
            select: { kind: 'selection' },
            result: {
              kind: 'combine',
              branches: Object.fromEntries(
                Array.from({ length: count }, (_, index) => [
                  `count${index}`,
                  countBranch(),
                ]),
              ),
            },
          },
        ]),
      ),
    },
  };
}

function budgetSelection(over: boolean): SelectAst {
  // Root (1) + outer scope (2) + three group scopes (6) + 95 count scopes (190) = 199.
  // A separate to-one sibling contributes one or two more validation nodes.
  return withChildren(wideBranch(), {
    kind: 'selection',
    fields: ['code'],
    includes: over
      ? [
          {
            kind: 'include',
            relation: 'next',
            select: { kind: 'selection', fields: ['code'] },
          },
        ]
      : [],
  });
}

describeIntegrationDatabases('Repository nested combine budgets', (context) => {
  async function prepare(): Promise<void> {
    await context.builder.createCollection('combineGraph', (c) => {
      c.string('code').primary().notNull();
      c.string('title').notNull();
      c.string('parentCode').nullable();
      c.string('nextCode').nullable();
      c.integer('version').notNull();
      c.optimisticLock('version');
      c.hasMany('children', 'combineGraph')
        .sourceKey('code')
        .foreignKey('parentCode')
        .constraints(false);
      c.belongsTo('next', 'combineGraph')
        .targetKey('code')
        .foreignKey('nextCode')
        .constraints(false);
    });
    await context.db(context.table('combineGraph')).insert([
      {
        code: 'P',
        title: 'Parent',
        parent_code: null,
        next_code: 'P',
        version: 1,
      },
      {
        code: 'C',
        title: 'Child',
        parent_code: 'P',
        next_code: null,
        version: 1,
      },
    ]);
  }

  it('accumulates depth across nested combine branches up to 20, then rejects 21', async () => {
    await prepare();
    const repository = context.database.repository('combineGraph');
    // Each combine increases branch depth; the terminal aggregate validates its target one level deeper.
    let expected: unknown = 1;
    for (let level = 0; level < 18; level++) expected = { nested: expected };
    expect(
      await repository.findMany({
        filter: { code: 'P' },
        select: withChildren(nestedBranch(18)),
      }),
    ).toEqual([{ code: 'P', children: expected }]);
    await expect(
      repository.findMany({
        filter: { code: 'P' },
        select: withChildren(nestedBranch(19)),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SELECT' });
  });

  it('shares the 200-node budget across nested groups and ordinary sibling includes', async () => {
    await prepare();
    const repository = context.database.repository('combineGraph');
    const groups = Object.fromEntries(
      [32, 32, 31].map((count, group) => [
        `group${group}`,
        Object.fromEntries(
          Array.from({ length: count }, (_, i) => [`count${i}`, 1]),
        ),
      ]),
    );
    expect(
      await repository.findMany({
        filter: { code: 'P' },
        select: budgetSelection(false),
      }),
    ).toEqual([{ code: 'P', children: groups, next: { code: 'P' } }]);
    await expect(
      repository.findMany({
        filter: { code: 'P' },
        select: budgetSelection(true),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SELECT' });
    // All individual groups are legal; only their combined validation cost exhausts the budget.
    const branch = wideBranch();
    if (branch.result?.kind !== 'combine') throw new Error('Expected combine');
    for (const group of Object.values(branch.result.branches)) {
      await expect(
        repository.findMany({
          filter: { code: 'missing' },
          select: withChildren(group),
        }),
      ).resolves.toEqual([]);
    }
  });

  it.each(['depth', 'nodes'] as const)(
    'rejects exceeded %s before nested writes and leaves the selection reusable',
    async (kind) => {
      await prepare();
      const repository = context.database.repository('combineGraph');
      const before = await context
        .db(context.table('combineGraph'))
        .orderBy('code');
      const valid =
        kind === 'depth'
          ? withChildren(nestedBranch(18))
          : budgetSelection(false);
      const invalid =
        kind === 'depth'
          ? withChildren(nestedBranch(19))
          : budgetSelection(true);
      await expect(
        repository.updateOne({
          filter: { code: 'P' },
          values: {
            title: 'Forbidden',
            children: { create: { code: 'NEW', title: 'Forbidden' } },
          },
          select: invalid,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_SELECT' });
      expect(
        await context.db(context.table('combineGraph')).orderBy('code'),
      ).toEqual(before);
      const first = await repository.findOne({
        filter: { code: 'P' },
        select: valid,
      });
      const second = await repository.findOne({
        filter: { code: 'P' },
        select: valid,
      });
      expect(second).toEqual(first);
    },
  );
});
