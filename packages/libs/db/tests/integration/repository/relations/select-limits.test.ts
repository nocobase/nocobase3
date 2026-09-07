import { expect, it } from 'vitest';
import type {
  SelectAst,
  SelectIncludeNode,
  SelectNode,
} from '../../../../src/index.js';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createDocumentationFixture } from '../fixtures/documentation.js';

function combineSelection(count: number): SelectAst {
  return {
    kind: 'select',
    version: 1,
    root: {
      kind: 'selection',
      fields: ['id'],
      includes: [
        {
          kind: 'include',
          relation: 'tasks',
          select: { kind: 'selection' },
          result: {
            kind: 'combine',
            branches: Object.fromEntries(
              Array.from({ length: count }, (_, i) => [
                `branch${i}`,
                { select: { kind: 'selection' }, result: { kind: 'count' } },
              ]),
            ),
          },
        },
      ],
    },
  };
}

function chain(depth: number): SelectNode {
  return {
    kind: 'selection',
    fields: ['code'],
    includes: depth
      ? [{ kind: 'include', relation: 'next', select: chain(depth - 1) }]
      : [],
  };
}

function tree(nodes: number): SelectNode {
  const remaining = nodes - 1;
  const left = Math.ceil(remaining / 2);
  const right = remaining - left;
  const includes: SelectIncludeNode[] = [];
  if (left)
    includes.push({ kind: 'include', relation: 'next', select: tree(left) });
  if (right)
    includes.push({ kind: 'include', relation: 'other', select: tree(right) });
  return { kind: 'selection', fields: ['code'], includes };
}

describeIntegrationDatabases('Repository Select limits', (context) => {
  it.each([1, 32])(
    'accepts %i combine branches and preserves every result name',
    async (count) => {
      await createDocumentationFixture(context);
      await context
        .db(context.table('projects'))
        .insert({ id: 'P', name: 'Project', version: 1 });
      const rows = await context.database
        .repository('projects')
        .findMany({ select: combineSelection(count) });
      expect(rows).toEqual([
        {
          id: 'P',
          tasks: Object.fromEntries(
            Array.from({ length: count }, (_, i) => [`branch${i}`, 0]),
          ),
        },
      ]);
    },
  );

  it.each([0, 33])(
    'rejects %i combine branches before changing the root',
    async (count) => {
      await createDocumentationFixture(context);
      await context
        .db(context.table('projects'))
        .insert({ id: 'P', name: 'Project', version: 1 });
      const before = await context.db(context.table('projects'));
      await expect(
        context.database.repository('projects').updateOne({
          filter: { id: 'P' },
          values: { name: 'Forbidden' },
          select: combineSelection(count),
        }),
      ).rejects.toMatchObject({ code: 'INVALID_SELECT' });
      expect(await context.db(context.table('projects'))).toEqual(before);
    },
  );

  it.each(['', '__proto__', 'constructor', 'prototype'])(
    'rejects reserved combine branch name %j',
    async (name) => {
      await createDocumentationFixture(context);
      const base = combineSelection(1);
      const include = base.root.includes![0];
      const select: SelectAst = {
        ...base,
        root: {
          ...base.root,
          includes: [
            {
              ...include,
              result: {
                kind: 'combine',
                branches: Object.fromEntries([
                  [
                    name,
                    {
                      select: { kind: 'selection' },
                      result: { kind: 'count' },
                    },
                  ],
                ]),
              },
            },
          ],
        },
      };
      await expect(
        context.database.repository('projects').findMany({ select }),
      ).rejects.toMatchObject({ code: 'INVALID_SELECT' });
    },
  );

  async function graphFixture(): Promise<void> {
    await context.builder.createCollection('selectionGraph', (c) => {
      c.string('code').primary().notNull();
      c.string('nextCode').nullable();
      c.string('otherCode').nullable();
      c.belongsTo('next', 'selectionGraph')
        .foreignKey('nextCode')
        .targetKey('code')
        .constraints(false);
      c.belongsTo('other', 'selectionGraph')
        .foreignKey('otherCode')
        .targetKey('code')
        .constraints(false);
    });
  }

  it('accepts depth 20 and rejects depth 21 with an explicit non-id string key', async () => {
    await graphFixture();
    await context
      .db(context.table('selectionGraph'))
      .insert({ code: 'A', next_code: 'A' });
    const repository = context.database.repository('selectionGraph');
    let expected: object = { code: 'A' };
    for (let i = 0; i < 20; i++) expected = { code: 'A', next: expected };
    expect(
      await repository.findMany({
        select: { kind: 'select', version: 1, root: chain(20) },
      }),
    ).toEqual([expected]);
    await expect(
      repository.findMany({
        select: { kind: 'select', version: 1, root: chain(21) },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SELECT' });
  });

  it('accepts 200 selection nodes and rejects 201 even for an empty result set', async () => {
    await graphFixture();
    const repository = context.database.repository('selectionGraph');
    expect(
      await repository.findMany({
        select: { kind: 'select', version: 1, root: tree(200) },
      }),
    ).toEqual([]);
    await expect(
      repository.findMany({
        select: { kind: 'select', version: 1, root: tree(201) },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SELECT' });
  });
});
