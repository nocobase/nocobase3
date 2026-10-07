// Scenarios 11 (return to the previous stage), 12 (return to the applicant
// or any earlier stage), 13 (withdraw) and 21 (what each decision approved).
import { describe, expect, it } from 'vitest';

import { ORG } from '../support/services.js';
import {
  reviewFullApproval,
  reviewFullLifecycle,
  reviewKeepingApproval,
  reviewKeepingLifecycle,
} from '../../server/scenarios/contract.js';
import { createHarness, refusal, type Harness } from '../support/harness.js';

const REVIEW = 'scenarioContractReviews';
const FULL = 'scenarioContractFullReviews';
const CONTRACT = { party: 'ACME', amount: 100_000, terms: 'net 30' };

function setup(): Harness {
  return createHarness({
    org: ORG,
    lifecycles: [reviewKeepingLifecycle as never, reviewFullLifecycle as never],
    approvals: [reviewKeepingApproval as never, reviewFullApproval as never],
  });
}

async function submitted(h: Harness, lifecycle = REVIEW): Promise<string> {
  const record = await h.create(
    lifecycle,
    { applicantId: 'zhang', submittedBy: null, ...CONTRACT },
    'zhang',
  );
  await h.fire(lifecycle, record.id, 'submit', {}, 'zhang');
  return String(record.id);
}

async function atFinance(): Promise<{ h: Harness; id: string }> {
  const h = setup();
  const id = await submitted(h);
  await h.answer(REVIEW, id, 'li');
  await h.answer(REVIEW, id, 'legalA');
  expect(await h.stage(REVIEW, id)).toBe('finance');
  return { h, id };
}

function returnTo(
  h: Harness,
  id: string,
  person: string,
  to: string,
  reason: string,
) {
  return h.taskOf(REVIEW, id, person).then((task) =>
    h.approvals.returnTo({
      taskId: task.id,
      actor: { id: person },
      to,
      reason,
    }),
  );
}

function revise(
  h: Harness,
  id: string,
  person: string,
  values: Record<string, string | number>,
) {
  return h.taskOf(REVIEW, id, person).then((task) =>
    h.approvals.revise({
      taskId: task.id,
      actor: { id: person },
      values,
      reason: 'Agreed with the counterparty',
    }),
  );
}

describe('scenario 11 · return to the previous stage', () => {
  it('finance returns it to legal; legal decides again, the manager’s approval stands', async () => {
    const { h, id } = await atFinance();
    await returnTo(h, id, 'finA', 'legal', 'Clause 7 is unclear');
    expect(await h.stage(REVIEW, id)).toBe('legal');
    const tasks = await h.tasks(REVIEW, id);
    expect(
      tasks.map(
        (task) =>
          `${task.stage}:${task.assigneeId}:${task.status}:${task.answer}`,
      ),
    ).toEqual([
      'manager:li:completed:approve',
      'legal:legalA:completed:approve',
      'finance:finA:completed:return',
      'legal:legalA:pending:null',
    ]);
    expect(tasks[2].comment).toBe('Clause 7 is unclear');
    await h.answer(REVIEW, id, 'legalA');
    expect(await h.stage(REVIEW, id)).toBe('finance');
  });

  it('legal revises the terms itself: what the manager approved is untouched, so it stands', async () => {
    const { h, id } = await atFinance();
    await returnTo(h, id, 'finA', 'legal', 'Clause 7');
    await revise(h, id, 'legalA', { terms: 'net 45' });
    expect(await h.stage(REVIEW, id)).toBe('legal');
    expect(await h.runHistory(REVIEW, id)).toContain('legal.revise');
    // The change is the run's: the record keeps what was submitted.
    expect(h.get(REVIEW, id)).toMatchObject({
      status: 'approving',
      terms: 'net 30',
    });
    const [run] = await h.runs(REVIEW, id);
    expect(run.submitted).toEqual(CONTRACT);
    expect(run.content).toEqual({ ...CONTRACT, terms: 'net 45' });
    expect(run.changes).toMatchObject([
      {
        stage: 'legal',
        actorId: 'legalA',
        values: { terms: 'net 45' },
        reason: 'Agreed with the counterparty',
      },
    ]);
    // Legal decides again on what it changed; the manager is not asked.
    expect(await h.open(REVIEW, id)).toEqual(['legalA:pending']);
  });

  it('legal revises the amount: the manager must approve the new amount again', async () => {
    const { h, id } = await atFinance();
    await returnTo(h, id, 'finA', 'legal', 'Price');
    await revise(h, id, 'legalA', { amount: 90_000 });
    expect(await h.stage(REVIEW, id)).toBe('manager');
    expect(
      (await h.events(REVIEW, id)).find(
        (event) => event.kind === 'content.revised',
      ),
    ).toMatchObject({
      stage: 'legal',
      actorId: 'legalA',
      data: { fields: ['amount'] },
    });
    await h.answer(REVIEW, id, 'li');
    expect(await h.stage(REVIEW, id)).toBe('legal');
  });

  it('only a stage allowed to revise may change the content', async () => {
    const { h, id } = await atFinance();
    expect((await refusal(revise(h, id, 'finA', { amount: 1 }))).code).toBe(
      'NOT_ALLOWED',
    );
  });

  it('may only return to an earlier stage', async () => {
    const { h, id } = await atFinance();
    expect((await refusal(returnTo(h, id, 'finA', 'ceo', 'x'))).code).toBe(
      'INVALID_TARGET',
    );
  });
});

describe("scenario 21 · a change is the run's until the run ends", () => {
  it('approved, the changes are written to the record by its approve exit', async () => {
    const { h, id } = await atFinance();
    await returnTo(h, id, 'finA', 'legal', 'Clause 7');
    await revise(h, id, 'legalA', { terms: 'net 45' });
    for (const person of ['legalA', 'finA', 'ceo'])
      await h.answer(REVIEW, id, person);
    expect(h.get(REVIEW, id)).toMatchObject({
      status: 'approved',
      terms: 'net 45',
      amount: 100_000,
    });
    const { transitions } = await h.runtime.history(REVIEW, id);
    expect(transitions.at(-1)).toMatchObject({
      transition: 'approve',
      actorId: 'ceo',
      input: {
        stage: 'ceo',
        outcome: 'approved',
        changes: { terms: 'net 45' },
      },
    });
  });

  it('a later change of the same field wins over an earlier one', async () => {
    const { h, id } = await atFinance();
    await returnTo(h, id, 'finA', 'legal', 'Clause 7');
    await revise(h, id, 'legalA', { terms: 'net 45' });
    await revise(h, id, 'legalA', { terms: 'net 60', party: 'ACME Ltd' });
    const [run] = await h.runs(REVIEW, id);
    expect(run.changes.map((change) => change.values)).toEqual([
      { terms: 'net 45' },
      { terms: 'net 60', party: 'ACME Ltd' },
    ]);
    expect(run.content).toEqual({
      ...CONTRACT,
      party: 'ACME Ltd',
      terms: 'net 60',
    });
    // The party was the manager's: asked again, on the content as changed.
    expect(await h.stage(REVIEW, id)).toBe('manager');
    for (const person of ['li', 'legalA', 'finA', 'ceo'])
      await h.answer(REVIEW, id, person);
    expect(h.get(REVIEW, id)).toMatchObject({
      status: 'approved',
      party: 'ACME Ltd',
      terms: 'net 60',
    });
  });

  it('rejected, the changes never reach the record', async () => {
    const { h, id } = await atFinance();
    await returnTo(h, id, 'finA', 'legal', 'Clause 7');
    await revise(h, id, 'legalA', { terms: 'net 45' });
    await h.answer(REVIEW, id, 'legalA');
    await h.answer(REVIEW, id, 'finA', 'reject', 'Too long.');
    expect(h.get(REVIEW, id)).toMatchObject({
      status: 'rejected',
      terms: 'net 30',
    });
  });

  it('returned to the applicant, the changes are written to the draft to work on', async () => {
    const { h, id } = await atFinance();
    await returnTo(h, id, 'finA', 'legal', 'Clause 7');
    await revise(h, id, 'legalA', { terms: 'net 45' });
    await returnTo(h, id, 'legalA', 'applicant', 'Sign the new terms first');
    expect(h.get(REVIEW, id)).toMatchObject({
      status: 'draft',
      terms: 'net 45',
    });
    // The next round is submitted from the record as it now is.
    await h.fire(REVIEW, id, 'submit', {}, 'zhang');
    const second = (await h.runs(REVIEW, id))[1];
    expect(second.submitted).toEqual({ ...CONTRACT, terms: 'net 45' });
    expect(second.changes).toEqual([]);
  });
});

describe('scenario 12 · return to the applicant or to any earlier stage', () => {
  it('returned to the applicant, a full re-review runs every stage again', async () => {
    const h = setup();
    const id = await submitted(h, FULL);
    await h.answer(FULL, id, 'li');
    const task = await h.taskOf(FULL, id, 'legalA');
    await h.approvals.returnTo({
      taskId: task.id,
      actor: { id: 'legalA' },
      to: 'applicant',
      reason: 'Wrong party',
    });
    expect(h.get(FULL, id).status).toBe('draft');
    await h.fire(FULL, id, 'edit', { terms: 'net 60' }, 'zhang');
    await h.fire(FULL, id, 'submit', {}, 'zhang');
    expect(await h.stage(FULL, id)).toBe('manager');
    expect((await h.runs(FULL, id)).length).toBe(2);
  });

  it('keeps an approval whose fields did not change, and re-reviews what did', async () => {
    const h = setup();
    const id = await submitted(h);
    for (const person of ['li', 'legalA', 'finA'])
      await h.answer(REVIEW, id, person);
    await returnTo(h, id, 'ceo', 'applicant', 'Terms');
    await h.fire(REVIEW, id, 'edit', { terms: 'net 60' }, 'zhang');
    await h.fire(REVIEW, id, 'submit', {}, 'zhang');
    // The manager covered party and amount: kept. Legal covered the terms.
    expect(await h.stage(REVIEW, id)).toBe('legal');
    const [first, second] = await h.runs(REVIEW, id);
    expect(first).toMatchObject({
      status: 'returned',
      returnedBy: { stage: 'ceo', resume: false },
    });
    expect(second.previousRunId).toBe(first.id);
    await h.answer(REVIEW, id, 'legalA');
    // Finance covered the amount, unchanged: kept too.
    expect(await h.stage(REVIEW, id)).toBe('ceo');
    const skipped = (await h.events(REVIEW, id))
      .filter((event) => event.kind === 'stage.skipped')
      .map((event) => `${event.stage}: ${event.message}`);
    expect(skipped).toEqual([
      'manager: Approved in the previous round; party, amount unchanged.',
      'finance: Approved in the previous round; amount unchanged.',
    ]);
    // The kept approvals are the first round's tasks, with that round's content.
    expect(
      (await h.tasks(REVIEW, id))
        .filter((task) => task.stage === 'manager')
        .map((task) => [task.runId, task.contentHash]),
    ).toEqual([[first.id, first.contentHash]]);
  });

  it('the CEO returns it to the manager stage: everything from there is decided again', async () => {
    const h = setup();
    const id = await submitted(h);
    for (const person of ['li', 'legalA', 'finA'])
      await h.answer(REVIEW, id, person);
    await returnTo(h, id, 'ceo', 'manager', 'Recheck');
    expect(await h.stage(REVIEW, id)).toBe('manager');
    for (const [person, stage] of [
      ['li', 'legal'],
      ['legalA', 'finance'],
      ['finA', 'ceo'],
    ] as const) {
      await h.answer(REVIEW, id, person);
      expect(await h.stage(REVIEW, id)).toBe(stage);
    }
  });
});

describe('scenario 13 · withdraw', () => {
  it('the applicant withdraws while finance is deciding; finance can no longer act', async () => {
    const { h, id } = await atFinance();
    await h.fire(REVIEW, id, 'withdraw', {}, 'zhang');
    expect(h.get(REVIEW, id).status).toBe('draft');
    expect((await refusal(h.answer(REVIEW, id, 'finA'))).code).toBe(
      'TASK_CLOSED',
    );
    const tasks = await h.tasks(REVIEW, id);
    expect(tasks.map((task) => `${task.assigneeId}:${task.status}`)).toEqual([
      'li:completed',
      'legalA:completed',
      'finA:voided',
    ]);
    expect(tasks[2].closeReason).toBe('withdraw');
    expect((await h.runs(REVIEW, id))[0]).toMatchObject({
      status: 'cancelled',
      endedBy: 'zhang',
      endedWith: 'withdraw',
    });
  });

  it('withdraw and approve at the same moment: exactly one of them wins', async () => {
    const { h, id } = await atFinance();
    const finance = await h.taskOf(REVIEW, id, 'finA');
    await h.fire(REVIEW, id, 'withdraw', {}, 'zhang');
    expect(
      (
        await refusal(
          h.approvals.respond({
            taskId: finance.id,
            actor: { id: 'finA' },
            answer: 'approve',
          }),
        )
      ).code,
    ).toBe('TASK_CLOSED');
  });

  it('a click on the old notification after resubmission does not land on the new round, even with the same content', async () => {
    const h = setup();
    const id = await submitted(h);
    const old = await h.taskOf(REVIEW, id, 'li');
    await h.fire(REVIEW, id, 'withdraw', {}, 'zhang');
    await h.fire(REVIEW, id, 'submit', {}, 'zhang');
    // The content, and so its hash, are the same as before the withdrawal;
    // what refuses the old answer is that a task belongs to one stay.
    expect(
      (
        await refusal(
          h.approvals.respond({
            taskId: old.id,
            actor: { id: 'li' },
            answer: 'approve',
            contentHash: old.contentHash ?? undefined,
          }),
        )
      ).code,
    ).toBe('TASK_CLOSED');
    expect(await h.open(REVIEW, id)).toEqual(['li:pending']);
  });

  it('only the applicant or the submitter may withdraw', async () => {
    const { h, id } = await atFinance();
    await expect(
      h.fire(REVIEW, id, 'withdraw', {}, 'li'),
    ).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
    });
  });
});

describe('scenario 21 · what each decision approved', () => {
  it('binds every answer to the run and the content hash it was made on', async () => {
    const { h, id } = await atFinance();
    const [run] = await h.runs(REVIEW, id);
    expect(run.content).toEqual(CONTRACT);
    expect(
      (await h.tasks(REVIEW, id))
        .filter((task) => task.answer !== null)
        .map((task) => [task.runId, task.contentHash]),
    ).toEqual([
      [run.id, run.contentHash],
      [run.id, run.contentHash],
    ]);
  });

  it('refuses a decision made on a page that showed other content', async () => {
    const { h, id } = await atFinance();
    const shown = (await h.runs(REVIEW, id))[0].contentHash;
    await returnTo(h, id, 'finA', 'legal', 'x');
    await revise(h, id, 'legalA', { terms: 'net 45' });
    expect(
      (
        await refusal(
          h.answer(REVIEW, id, 'legalA', 'approve', undefined, {
            contentHash: shown,
          }),
        )
      ).code,
    ).toBe('STALE_CONTENT');
  });

  it('the applicant cannot change the content under review; only withdrawing opens it again', async () => {
    const { h, id } = await atFinance();
    expect(await h.allowed(REVIEW, id, 'zhang')).toEqual(['withdraw']);
    expect(await h.actions(REVIEW, id, 'zhang')).toEqual([]);
  });

  it("the run's log keeps the stages; the tasks keep who answered what", async () => {
    const { h, id } = await atFinance();
    const [run] = await h.runs(REVIEW, id);
    const log = (await h.runtime.history('approval:contractReview', run.id))
      .transitions;
    expect(log.map((entry) => [entry.transition, entry.actorId])).toEqual([
      ['$create', 'zhang'],
      ['manager.approve', 'li'],
      ['legal.approve', 'legalA'],
    ]);
    expect(await h.history(REVIEW, id)).toEqual(['$create', 'submit']);
  });
});
