// Scenario 20: one to-do center read from the task table.
import { describe, expect, it } from 'vitest';

import { ORG } from '../support/services.js';
import type { Approval } from '@nocobase/app-plugin-approval/server';
import {
  financeApproval,
  financeLifecycle,
  purchaseApproval,
  purchaseLifecycle,
} from '../../server/scenarios/collaboration.js';
import {
  reviewKeepingApproval,
  reviewKeepingLifecycle,
} from '../../server/scenarios/contract.js';
import {
  poolApproval,
  poolLifecycle,
  tripApproval,
  tripLifecycle,
} from '../../server/scenarios/participation.js';
import {
  expenseApproval,
  expenseLifecycle,
} from '../../server/scenarios/responsibility.js';
import { todosFor, type TodoBox } from '../../server/scenarios/todo.js';
import { createHarness, refusal, type Harness } from '../support/harness.js';

const APPROVALS = [
  expenseApproval,
  purchaseApproval,
  financeApproval,
  poolApproval,
  tripApproval,
  reviewKeepingApproval,
] as unknown as Approval<never>[];

function center(): Harness {
  return createHarness({
    org: ORG,
    lifecycles: [
      expenseLifecycle as never,
      purchaseLifecycle as never,
      financeLifecycle as never,
      poolLifecycle as never,
      tripLifecycle as never,
      reviewKeepingLifecycle as never,
    ],
    approvals: APPROVALS,
  });
}

function box(
  h: Harness,
  person: string,
  which: TodoBox,
  extra: { limit?: number; offset?: number } = {},
) {
  return todosFor(
    h.approvals,
    h.runtime,
    h.org,
    APPROVALS,
    { person, box: which, ...extra },
    h.now(),
  );
}

async function submitted(
  h: Harness,
  lifecycle: string,
  values: Record<string, unknown> = {},
  applicantId = 'zhang',
): Promise<string> {
  const record = await h.create(
    lifecycle,
    { applicantId, ...values },
    applicantId,
  );
  await h.fire(lifecycle, record.id, 'submit', {}, applicantId);
  return String(record.id);
}

describe('scenario 20 · a unified to-do center over task rows', () => {
  it('lists what a person has to do across kinds, oldest first', async () => {
    const h = center();
    const expense = await submitted(h, 'scenarioExpenses');
    h.advance({ minutes: 5 });
    const purchase = await submitted(h, 'scenarioPurchaseRequests', {
      amount: 500,
    });
    h.advance({ minutes: 5 });
    await submitted(h, 'scenarioFinanceRequests', { mode: 'any' });
    expect(
      (await box(h, 'li', 'toDo')).map((item) => [
        item.lifecycle,
        item.recordId,
        item.action,
        item.detail,
      ]),
    ).toEqual([
      ['scenarioExpenses', expense, 'respond', 'Manager'],
      ['scenarioPurchaseRequests', purchase, 'respond', 'Manager'],
    ]);
  });

  it('moves an item from to-do to done the moment it is answered', async () => {
    const h = center();
    const id = await submitted(h, 'scenarioExpenses');
    await h.answer('scenarioExpenses', id, 'li');
    expect(await box(h, 'li', 'toDo')).toEqual([]);
    expect((await box(h, 'li', 'done')).map((item) => item.detail)).toEqual([
      'approve',
    ]);
  });

  it('drops an or-signed item for the others once one person settles it', async () => {
    const h = center();
    const id = await submitted(h, 'scenarioFinanceRequests', { mode: 'any' });
    expect(await box(h, 'finB', 'toDo')).toHaveLength(1);
    await h.answer('scenarioFinanceRequests', id, 'finA');
    expect(await box(h, 'finB', 'toDo')).toEqual([]);
  });

  it('shows a pooled item to every candidate until someone takes it', async () => {
    const h = center();
    const id = await submitted(h, 'scenarioPoolRequests');
    for (const person of ['finA', 'finB', 'finC'])
      expect((await box(h, person, 'toDo')).map((item) => item.action)).toEqual(
        ['claim'],
      );
    const task = await h.taskOf('scenarioPoolRequests', id, 'finB');
    await h.approvals.claim({ taskId: task.id, actor: { id: 'finB' } });
    expect(await box(h, 'finA', 'toDo')).toEqual([]);
    expect((await box(h, 'finB', 'toDo')).map((item) => item.action)).toEqual([
      'respond',
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
    await submitted(h, 'scenarioExpenses');
    expect((await box(h, 'wang', 'toDo')).map((item) => item.detail)).toEqual([
      'Manager, for li',
    ]);
  });

  it('lists what someone started, as applicant or as the proxy who submitted', async () => {
    const h = center();
    const record = await h.create(
      'scenarioTrips',
      {
        applicantId: 'zhang',
        createdBy: 'assistant',
        submittedBy: null,
        city: 'Shenzhen',
      },
      'assistant',
    );
    await h.fire('scenarioTrips', record.id, 'submit', {}, 'assistant');
    expect(await box(h, 'zhang', 'mine')).toHaveLength(1);
    expect(await box(h, 'assistant', 'mine')).toHaveLength(1);
  });

  it('lists copies once the request is approved; a copy is to read, not to decide', async () => {
    const h = center();
    const id = await submitted(h, 'scenarioContractReviews', {
      submittedBy: null,
      party: 'ACME',
      amount: 1,
      terms: 'x',
    });
    for (const person of ['li', 'legalA', 'finA', 'ceo'])
      await h.answer('scenarioContractReviews', id, person);
    expect(
      (await box(h, 'wang', 'copiedToMe')).map((item) => item.action),
    ).toEqual(['read']);
    expect(await box(h, 'wang', 'toDo')).toEqual([]);
    const [copy] = (await h.tasks('scenarioContractReviews', id)).filter(
      (task) => task.kind === 'copy',
    );
    await h.approvals.respond({
      taskId: copy.id,
      actor: { id: 'wang' },
      answer: 'read',
    });
    expect(
      (await box(h, 'wang', 'copiedToMe')).map((item) => item.action),
    ).toEqual(['view']);
  });

  it('a withdrawn request leaves everyone’s to-do at once', async () => {
    const h = center();
    const id = await submitted(h, 'scenarioContractReviews', {
      submittedBy: null,
      party: 'ACME',
      amount: 1,
      terms: 'x',
    });
    expect(await box(h, 'li', 'toDo')).toHaveLength(1);
    await h.fire('scenarioContractReviews', id, 'withdraw', {}, 'zhang');
    expect(await box(h, 'li', 'toDo')).toEqual([]);
  });

  it('pages the list', async () => {
    const h = center();
    for (let index = 0; index < 5; index += 1) {
      await submitted(h, 'scenarioExpenses');
      h.advance({ minutes: 1 });
    }
    expect(await box(h, 'li', 'toDo', { limit: 2, offset: 2 })).toHaveLength(2);
  });

  it('limitation: a guard another plugin puts on a stage’s conclusion is met only when an answer concludes it', async () => {
    const h = center();
    const id = await submitted(h, 'scenarioExpenses');
    h.runtime.addGuard('scenarioExpenses', 'approve', () => ({
      code: 'budgetFrozen',
      message: 'Frozen.',
    }));
    // The to-do lists the task; the answer that would conclude the stage is
    // refused by the guard, and rolls back with it.
    expect(await box(h, 'li', 'toDo')).toHaveLength(1);
    expect((await refusal(h.answer('scenarioExpenses', id, 'li'))).code).toBe(
      'GUARD_REJECTED',
    );
    expect(await h.open('scenarioExpenses', id)).toEqual(['li:pending']);
  });
});
