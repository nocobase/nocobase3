import { expect, it } from 'vitest';
import {
  DefaultRelationSelectBuilder,
  DefaultSelectBuilder,
} from '../../../src/repository/select-builder.js';

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
