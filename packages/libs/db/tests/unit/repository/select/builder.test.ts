import { expect, it } from 'vitest';
import {
  DefaultRelationSelectBuilder,
  DefaultSelectBuilder,
} from '../../../../src/repository/select-builder.js';

it('keeps relation selection branches independent and honors callback returns', () => {
  const tasks = new DefaultRelationSelectBuilder();
  const first = tasks.fields('title').limit(1);
  const second = tasks.fields('id').limit(5);
  expect(tasks.toState().fields).toBeUndefined();
  expect(tasks.toState().limit).toBeUndefined();
  expect(first.toState()).toMatchObject({ fields: ['title'], limit: 1 });
  expect(second.toState()).toMatchObject({ fields: ['id'], limit: 5 });
  const select = new DefaultSelectBuilder()
    .include('tasks', (tasks) =>
      tasks.combine({
        records: tasks.fields('title').limit(1),
        count: tasks.count(),
      }),
    )
    .toState();
  const result = select.includes?.[0].result;
  expect(result?.kind).toBe('combine');
  if (result?.kind !== 'combine') throw new Error('Expected combine');
  expect(result.branches.records.limit).toBe(1);
  expect(result.branches.count.limit).toBeUndefined();
});

it('distinguishes omitted fields from empty fields and copies root snapshots', () => {
  const root = new DefaultSelectBuilder();
  expect(root.toState().fields).toBeUndefined();
  expect(root.fields()).toBe(root);
  expect(root.toState().fields).toEqual([]);
  root.fields('name');
  const snapshot = root.toState();
  root.fields('status').include('tasks');
  expect(snapshot).toEqual({
    kind: 'selection',
    fields: ['name'],
    includes: [],
  });
  expect(root.toState()).toMatchObject({
    fields: ['name', 'status'],
    includes: [{ relation: 'tasks' }],
  });
});

it('keeps relation options and nested includes independent across sibling branches', () => {
  const relation = new DefaultRelationSelectBuilder();
  const distinct = ['status'];
  const first = relation
    .fields('title')
    .filter({ status: 'draft' })
    .sort((s) => s.field('id').asc())
    .limit(2)
    .cursor({ id: 'T' })
    .direction('backward')
    .distinct(distinct)
    .include('owner', (s) => s.fields('name'));
  const second = relation.fields('id').limit(5);
  distinct.push('title');
  expect(relation.toState()).toMatchObject({
    fields: undefined,
    includes: [],
    filter: undefined,
    sort: undefined,
    limit: undefined,
    cursor: undefined,
    direction: undefined,
    distinct: undefined,
  });
  expect(first.toState()).toMatchObject({
    fields: ['title'],
    limit: 2,
    cursor: { id: 'T' },
    direction: 'backward',
    distinct: ['status'],
    includes: [{ relation: 'owner', select: { fields: ['name'] } }],
  });
  expect(second.toState()).toMatchObject({
    fields: ['id'],
    limit: 5,
    includes: [],
    filter: undefined,
    cursor: undefined,
    distinct: undefined,
  });
});

it('serializes every scalar relation aggregate without modifying the source', () => {
  const relation = new DefaultRelationSelectBuilder().filter({
    status: 'draft',
  });
  const root = new DefaultSelectBuilder().include('tasks', () =>
    relation.combine({
      all: relation.count(),
      filled: relation.count('points'),
      sum: relation.sum('points'),
      avg: relation.avg('points'),
      min: relation.min('points'),
      max: relation.max('points'),
    }),
  );
  const result = root.toState().includes?.[0].result;
  if (result?.kind !== 'combine') throw new Error('Expected combine');
  expect(
    Object.fromEntries(
      Object.entries(result.branches).map(([name, branch]) => [
        name,
        branch.result,
      ]),
    ),
  ).toEqual({
    all: { kind: 'count', field: undefined },
    filled: { kind: 'count', field: 'points' },
    sum: { kind: 'sum', field: 'points' },
    avg: { kind: 'avg', field: 'points' },
    min: { kind: 'min', field: 'points' },
    max: { kind: 'max', field: 'points' },
  });
  expect(relation.toState().result).toBeUndefined();
  expect(relation.toState().fields).toBeUndefined();
});

it('rejects forged relation expressions and callbacks without returns', () => {
  const root = new DefaultSelectBuilder();
  expect(() => root.include('tasks', (() => undefined) as never)).toThrow(
    TypeError,
  );
  expect(() =>
    root.include('tasks', (() => ({
      kind: 'relationSelectionExpression',
      toState: () => ({}),
    })) as never),
  ).toThrow(TypeError);
  expect(() =>
    root.include('tasks', (tasks) => tasks.combine({ bad: {} as never })),
  ).toThrow(TypeError);
  expect(root.toState().includes).toEqual([]);
});
