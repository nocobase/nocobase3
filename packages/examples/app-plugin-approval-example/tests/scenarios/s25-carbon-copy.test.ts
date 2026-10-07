// Scenario 25: a carbon copy is the approval layer's copy
// task; a notice's read confirmations are the notice's second layer.
import { SYSTEM_ACTOR } from '@nocobase/lifecycle';
import { describe, expect, it } from 'vitest';

import { ORG } from '../support/services.js';
import {
  reviewKeepingApproval,
  reviewKeepingLifecycle,
} from '../../server/scenarios/contract.js';
import {
  NoticeAcknowledgements,
  noticeLifecycle,
  NOTICES,
  visibleComments,
} from '../../server/scenarios/notice.js';
import { createHarness, refusal, type Harness } from '../support/harness.js';

const REVIEW = 'scenarioContractReviews';

function setUp(parameters: Record<string, unknown> = {}) {
  const h = createHarness({
    org: { ...ORG, people: [...ORG.people, 'u1', 'u2', 'u3', 'outsider'] },
    lifecycles: [reviewKeepingLifecycle as never, noticeLifecycle as never],
    approvals: [reviewKeepingApproval as never],
    parameters: { [NOTICES]: parameters },
  });
  return { h, acks: new NoticeAcknowledgements(h.runtime) };
}

async function publish(
  h: Harness,
  mode: 'notify' | 'receipt' | 'confirmAll',
  recipientIds: string[],
): Promise<string> {
  const notice = await h.create(
    NOTICES,
    {
      title: 'Travel policy 2027',
      publisherId: 'hr',
      mode,
      recipientIds,
      publishedAt: null,
      effectiveAt: null,
    },
    'hr',
  );
  await h.fire(NOTICES, notice.id, 'publish', {}, 'hr');
  return String(notice.id);
}

const remind = (h: Harness, acks: NoticeAcknowledgements) =>
  acks.remind({
    outbox: {
      send: (to: string, subject: string, key: string) =>
        void h.sent.push({ to, subject, key }),
    },
  } as never);

describe('scenario 25 · the carbon copy of an approved request is a copy task', () => {
  it('created with the approval, to read and not to decide', async () => {
    const { h } = setUp();
    const record = await h.create(
      REVIEW,
      {
        applicantId: 'zhang',
        submittedBy: null,
        party: 'ACME',
        amount: 1,
        terms: 'x',
      },
      'zhang',
    );
    await h.fire(REVIEW, record.id, 'submit', {}, 'zhang');
    for (const person of ['li', 'legalA', 'finA', 'ceo'])
      await h.answer(REVIEW, String(record.id), person);
    const [copy] = (await h.tasks(REVIEW, record.id)).filter(
      (task) => task.kind === 'copy',
    );
    expect(copy).toMatchObject({
      assigneeId: 'wang',
      status: 'pending',
      stage: 'approved',
    });
    expect(
      (
        await refusal(
          h.approvals.respond({
            taskId: copy.id,
            actor: { id: 'wang' },
            answer: 'approve',
          }),
        )
      ).code,
    ).toBe('INVALID_ANSWER');
    await h.approvals.respond({
      taskId: copy.id,
      actor: { id: 'wang' },
      answer: 'read',
    });
    // Opening it again is answered, not refused.
    expect(
      (
        await h.approvals.respond({
          taskId: copy.id,
          actor: { id: 'wang' },
          answer: 'read',
        })
      ).outcome,
    ).toBe('replayed');
    expect(h.get(REVIEW, record.id).status).toBe('approved');
  });
});

describe('scenario 25 · notices', () => {
  it('notify only: effective at once, rows owe nothing and are never reminded', async () => {
    const { h, acks } = setUp();
    const id = await publish(h, 'notify', ['u1', 'u2']);
    expect(h.get(NOTICES, id).status).toBe('effective');
    expect(
      (await acks.list(id)).map((ack) => [
        ack.recipientId,
        ack.kind,
        ack.blocking,
        ack.deliveredAt !== null,
      ]),
    ).toEqual([
      ['u1', 'notify', false, true],
      ['u2', 'notify', false, true],
    ]);
    expect(h.messagesTo('u1')).toEqual([
      'For your information: Travel policy 2027',
    ]);
    h.advance({ days: 5 });
    expect(await remind(h, acks)).toBe(0);
  });

  it('read receipt: the unread are reminded until they open it, each on its own clock', async () => {
    const { h, acks } = setUp({ remindAfterHours: 24, maxReminders: 2 });
    const id = await publish(h, 'receipt', ['u1', 'u2']);
    await acks.read(id, { id: 'u1' });
    h.advance({ hours: 25 });
    expect(await remind(h, acks)).toBe(1);
    expect(h.messagesTo('u2')).toEqual([
      'Please read: Travel policy 2027',
      'Reminder 1: Travel policy 2027',
    ]);
    h.advance({ hours: 25 });
    expect(await remind(h, acks)).toBe(1);
    h.advance({ hours: 25 });
    expect(await remind(h, acks)).toBe(0);
    expect(
      (await acks.list(id)).map((ack) => [
        ack.recipientId,
        ack.status,
        ack.reminders,
      ]),
    ).toEqual([
      ['u1', 'read', 0],
      ['u2', 'unread', 2],
    ]);
  });

  it('all confirm before continuing: the last confirmation makes the notice effective in its own transaction', async () => {
    const { h, acks } = setUp();
    const id = await publish(h, 'confirmAll', ['u1', 'u2']);
    const collecting = h.get(NOTICES, id);
    expect(collecting.status).toBe('collecting');
    await acks.read(id, { id: 'u1' });
    await acks.confirm(id, { id: 'u1' });
    // Reading and confirming moved the rows, not the notice.
    expect(h.get(NOTICES, id)).toBe(collecting);
    expect(await h.allowed(NOTICES, id, 'hr')).toEqual([
      'addRecipients',
      'withdraw',
    ]);
    await acks.confirm(id, { id: 'u2' });
    expect(h.get(NOTICES, id)).toMatchObject({
      status: 'effective',
      effectiveAt: h.now().toISOString(),
    });
    expect(
      (await h.runtime.history(NOTICES, id)).transitions.map((entry) => [
        entry.transition,
        entry.actorId,
      ]),
    ).toEqual([
      ['$create', 'hr'],
      ['publish', 'hr'],
      ['becomeEffective', 'system'],
    ]);
  });

  it('adding a person while collecting widens "everyone": the old last confirmation no longer completes it', async () => {
    const { h, acks } = setUp();
    const id = await publish(h, 'confirmAll', ['u1', 'u2']);
    await acks.confirm(id, { id: 'u1' });
    await h.fire(
      NOTICES,
      id,
      'addRecipients',
      { recipientIds: ['u3', 'u1'] },
      'hr',
    );
    expect(
      (await acks.list(id)).map((ack) => [ack.recipientId, ack.blocking]),
    ).toEqual([
      ['u1', true],
      ['u2', true],
      ['u3', true],
    ]);
    await acks.confirm(id, { id: 'u2' });
    expect(h.get(NOTICES, id).status).toBe('collecting');
    await acks.confirm(id, { id: 'u3' });
    expect(h.get(NOTICES, id).status).toBe('effective');
  });

  it('race with the last confirmation: one decided on the list before the addition is refused, and its confirmation rolls back with it', async () => {
    const { h, acks } = setUp();
    const id = await publish(h, 'confirmAll', ['u1', 'u2']);
    await acks.confirm(id, { id: 'u1' });
    const seen = h.get(NOTICES, id);
    await h.fire(NOTICES, id, 'addRecipients', { recipientIds: ['u3'] }, 'hr');
    // What the last confirmation would fire, decided on the version it read.
    await expect(
      h.runtime.fire(NOTICES, id, 'becomeEffective', {
        actor: SYSTEM_ACTOR,
        expect: { version: seen.lifecycleVersion as number },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await acks.confirm(id, { id: 'u2' });
    expect(h.get(NOTICES, id).status).toBe('collecting');
    expect(await acks.waiting(id)).toEqual(['u3']);
  });

  it('adding a person once effective asks them to confirm without blocking anything', async () => {
    const { h, acks } = setUp();
    const id = await publish(h, 'confirmAll', ['u1']);
    await acks.confirm(id, { id: 'u1' });
    expect(h.get(NOTICES, id).status).toBe('effective');
    await h.fire(NOTICES, id, 'addRecipients', { recipientIds: ['u3'] }, 'hr');
    expect(
      (await acks.list(id)).find((ack) => ack.recipientId === 'u3'),
    ).toMatchObject({ kind: 'confirm', blocking: false });
    await acks.confirm(id, { id: 'u3' });
    expect(h.get(NOTICES, id).status).toBe('effective');
  });

  it('withdrawing revokes the rows: sight is gone and a late confirmation is refused; a confirmation given stays', async () => {
    const { h, acks } = setUp();
    const id = await publish(h, 'confirmAll', ['u1', 'u2']);
    await acks.confirm(id, { id: 'u1' });
    await h.fire(NOTICES, id, 'withdraw', {}, 'hr');
    expect((await acks.list(id)).map((ack) => ack.status)).toEqual([
      'confirmed',
      'revoked',
    ]);
    expect((await refusal(acks.confirm(id, { id: 'u2' }))).code).toBe(
      'TASK_CLOSED',
    );
    expect(await acks.canView(id, 'u2')).toBe(false);
    expect(await acks.canView(id, 'u1')).toBe(true);
    expect(await acks.canView(id, 'outsider')).toBe(false);
  });

  it('a reminder writes the row alone: a confirmation from a page loaded before it still goes through', async () => {
    const { h, acks } = setUp();
    const id = await publish(h, 'confirmAll', ['u1']);
    const before = h.get(NOTICES, id);
    h.advance({ hours: 25 });
    expect(await remind(h, acks)).toBe(1);
    expect(h.get(NOTICES, id)).toBe(before);
    await acks.confirm(id, { id: 'u1' });
    expect(h.get(NOTICES, id).status).toBe('effective');
  });

  it('a comment restarts nobody’s clock: the reminder comes when it is due', async () => {
    const { h, acks } = setUp({ remindAfterHours: 24 });
    const id = await publish(h, 'confirmAll', ['u1']);
    await acks.read(id, { id: 'u1' });
    h.advance({ hours: 20 });
    await acks.comment(id, { id: 'u1' }, 'Question');
    h.advance({ hours: 5 });
    expect(await remind(h, acks)).toBe(1);
  });

  it('comments: who sees one depends on the visibility; switched off, both kinds are refused', async () => {
    const { h, acks } = setUp();
    const id = await publish(h, 'confirmAll', ['u1', 'u2']);
    await acks.comment(id, { id: 'u1' }, 'Does this cover contractors?');
    await acks.confirm(id, { id: 'u2' }, 'OK');
    const rows = await acks.list(id);
    const texts = (viewer: string, visibility: 'owner' | 'recipients') =>
      visibleComments(rows, viewer, 'hr', visibility).map(
        (comment) => comment.text,
      );
    expect(texts('hr', 'owner')).toEqual([
      'Does this cover contractors?',
      'OK',
    ]);
    expect(texts('u2', 'owner')).toEqual(['OK']);
    expect(texts('u2', 'recipients')).toEqual([
      'Does this cover contractors?',
      'OK',
    ]);
    expect(texts('outsider', 'recipients')).toEqual([]);
    expect(h.get(NOTICES, id).status).toBe('collecting');

    const off = setUp({ allowComments: false });
    const other = await publish(off.h, 'confirmAll', ['u1']);
    expect(
      (await refusal(off.acks.comment(other, { id: 'u1' }, 'x'))).code,
    ).toBe('NOT_ALLOWED');
    expect(
      (await refusal(off.acks.confirm(other, { id: 'u1' }, 'fine'))).code,
    ).toBe('NOT_ALLOWED');
    await off.acks.confirm(other, { id: 'u1' });
    expect(off.h.get(NOTICES, other).status).toBe('effective');
  });
});
