// Scenario 20: one to-do center over every kind of request.
import { describe, expect, it } from 'vitest';

import { acknowledgementLifecycle } from '../../server/approval-scenarios/acknowledgement.js';
import {
  acknowledgementTodoSource,
  approvalTodoSource,
  todosFor,
  type TodoBox,
} from '../../server/approval-scenarios/todo.js';
import {
  approvalHarness,
  decide,
  draft,
  submitted,
} from './approval-fixtures.js';
import type { Harness } from './harness.js';

function center() {
  return approvalHarness({ lifecycles: [acknowledgementLifecycle as never] });
}

async function box(h: Harness, person: string, which: TodoBox, verify = true) {
  return todosFor(
    [approvalTodoSource, acknowledgementTodoSource],
    h.services,
    h.runtime,
    { person, box: which, verify },
    h.now(),
  );
}

describe('scenario 20: a unified to-do center', () => {
  it('lists what a person has to do across kinds, oldest first', async () => {
    const h = center();
    const leave = await submitted(h, 'leaveTiered', { days: 1 });
    h.advance({ minutes: 5 });
    const purchase = await submitted(h, 'purchaseChain', { amount: 500 });
    h.advance({ minutes: 5 });
    await submitted(h, 'financeAny', {}); // not li's
    const items = await box(h, 'li', 'toDo');
    expect(
      items.map((item) => [item.recordId, item.action, item.detail]),
    ).toEqual([
      [String(leave.id), 'decide', 'Manager'],
      [String(purchase.id), 'decide', 'Manager'],
    ]);
  });

  it('moves an item from to-do to done the moment it is decided', async () => {
    const h = center();
    const r = await submitted(h, 'leaveTiered', { days: 1 });
    await decide(h, r.id, 'li');
    expect(await box(h, 'li', 'toDo')).toEqual([]);
    expect((await box(h, 'li', 'done')).map((item) => item.detail)).toEqual([
      'approved',
    ]);
  });

  it('drops an or-signed item for the others once one person settles it', async () => {
    const h = center();
    const r = await submitted(h, 'financeAny', {});
    expect(await box(h, 'finB', 'toDo')).toHaveLength(1);
    await decide(h, r.id, 'finA');
    expect(await box(h, 'finB', 'toDo')).toEqual([]);
  });

  it('shows a pooled item to every candidate until someone takes it', async () => {
    const h = center();
    const r = await submitted(h, 'financePool', {});
    for (const person of ['finA', 'finB', 'finC'])
      expect((await box(h, person, 'toDo')).map((item) => item.action)).toEqual(
        ['claim'],
      );
    await h.fire('approvalRequests', r.id, 'claim', {}, 'finB');
    expect(await box(h, 'finA', 'toDo')).toEqual([]);
    expect((await box(h, 'finB', 'toDo')).map((item) => item.action)).toEqual([
      'decide',
    ]);
  });

  it('shows a delegate what they may decide, and for whom', async () => {
    const h = center();
    h.org.delegate({
      from: 'li',
      to: 'wang',
      start: '2026-10-01T00:00:00Z',
      end: '2026-10-15T00:00:00Z',
      kinds: [],
      coversExisting: true,
      createdAt: '2026-09-30T00:00:00Z',
    });
    await submitted(h, 'leaveTiered', { days: 1 });
    expect((await box(h, 'wang', 'toDo')).map((item) => item.detail)).toEqual([
      'Manager, for li',
    ]);
  });

  it('lists what someone started, as applicant or as the proxy who submitted', async () => {
    const h = center();
    const r = await draft(h, 'travel', {}, 'zhang', { createdBy: 'assistant' });
    await h.fire('approvalRequests', r.id, 'submit', {}, 'assistant');
    expect(await box(h, 'zhang', 'mine')).toHaveLength(1);
    expect(await box(h, 'assistant', 'mine')).toHaveLength(1);
  });

  it('lists carbon copies once the request is approved', async () => {
    const h = center();
    const r = await submitted(h, 'contract', {
      party: 'ACME',
      amount: 1,
      terms: 'x',
    });
    for (const person of ['li', 'legalA', 'finA', 'ceo'])
      await decide(h, r.id, person);
    expect(
      (await box(h, 'wang', 'copiedToMe')).map((item) => item.title),
    ).toEqual([`contract of zhang`]);
    // A copy is something to look at, not to decide.
    expect(await box(h, 'wang', 'toDo')).toEqual([]);
  });

  it('a withdrawn request leaves everyone’s to-do at once', async () => {
    const h = center();
    const r = await submitted(h, 'leaveTiered', { days: 1 });
    await h.fire('approvalRequests', r.id, 'withdraw', {}, 'zhang');
    expect(await box(h, 'li', 'toDo')).toEqual([]);
  });

  it('pages the list', async () => {
    const h = center();
    for (let index = 0; index < 5; index += 1) {
      await submitted(h, 'leaveTiered', { days: 1 });
      h.advance({ minutes: 1 });
    }
    const page = await todosFor(
      [approvalTodoSource],
      h.services,
      h.runtime,
      { person: 'li', box: 'toDo', limit: 2, offset: 2 },
      h.now(),
    );
    expect(page).toHaveLength(2);
  });

  it('limitation: a derived list does not see another plugin’s guard unless it asks the lifecycle', async () => {
    const h = center();
    await submitted(h, 'leaveTiered', { days: 1 });
    h.runtime.addGuard('approvalRequests', 'decide', () => ({
      code: 'budgetFrozen',
      message: 'Frozen.',
    }));
    expect(await box(h, 'li', 'toDo', false)).toHaveLength(1);
    expect(await box(h, 'li', 'toDo', true)).toEqual([]);
  });

  it('answers one person from their own task rows, without reading anyone else’s requests', async () => {
    const h = center();
    const read: string[] = [];
    const { records } = h.services;
    const counting = {
      ...h.services,
      records: {
        ...records,
        list: async (...args: Parameters<typeof records.list>) => {
          read.push(`list:${args[0]}`);
          return records.list(...args);
        },
        find: async (...args: Parameters<typeof records.find>) => {
          const rows = await records.find(...args);
          read.push(`find:${args[0]}:${rows.length}`);
          return rows;
        },
      },
    };
    for (let index = 0; index < 10; index += 1)
      await submitted(h, 'financeAny', {});
    await todosFor(
      [approvalTodoSource],
      counting,
      h.runtime,
      { person: 'li', box: 'toDo' },
      h.now(),
    );
    // Nothing is li's: two indexed lookups, by assignee and status, find nothing.
    expect(read).toEqual([
      'find:scenarioApprovalTasks:0',
      'find:scenarioApprovalTasks:0',
    ]);
  });
});
