// Scenario 25: carbon copies and read confirmations, on the
// `acknowledgements` and `notices` lifecycles.
import {
  SYSTEM_ACTOR,
  type Lifecycle,
  type LifecycleRecord,
  type LifecycleTypes,
} from '@nocobase/lifecycle';
import { describe, expect, it } from 'vitest';

import {
  acknowledgementLifecycle,
  canViewSource,
  visibleComments,
  type Acknowledgement,
} from '../../server/approval-scenarios/acknowledgement.js';
import { noticeLifecycle } from '../../server/approval-scenarios/notice.js';
import { SCENARIO_COLLECTIONS } from '../../server/approval-scenarios/services.js';
import { createHarness, type Harness } from './harness.js';

const PEOPLE = ['hr', 'sales-head', 'u1', 'u2', 'u3', 'outsider'];

function setUp(
  parameters: Record<string, Record<string, unknown>> = {},
): Harness {
  return createHarness({
    org: { people: PEOPLE },
    lifecycles: [
      acknowledgementLifecycle as unknown as Lifecycle<LifecycleTypes>,
      noticeLifecycle as unknown as Lifecycle<LifecycleTypes>,
    ],
    parameters,
  });
}

async function publish(
  h: Harness,
  mode: 'notify' | 'receipt' | 'confirmAll',
  recipientIds: string[],
): Promise<LifecycleRecord> {
  const notice = await h.create(
    'notices',
    { title: 'Travel policy 2027', publisherId: 'hr', mode, recipientIds },
    'hr',
  );
  return h.fire('notices', notice.id, 'publish', {}, 'hr');
}

function copyOf(
  h: Harness,
  sourceId: unknown,
  person: string,
): Acknowledgement {
  const copy = (h.all('acknowledgements') as Acknowledgement[]).find(
    (row) => row.sourceId === String(sourceId) && row.recipientId === person,
  );
  if (!copy) throw new Error(`No copy for ${person}.`);
  return copy;
}

/** What the approval lifecycle does after approval, per its contract. */
async function carbonCopy(
  h: Harness,
  requestId: string,
  recipientId: string,
): Promise<void> {
  const existing = await h.services.records.list(
    SCENARIO_COLLECTIONS.acknowledgements,
    (row) =>
      row.sourceLifecycle === 'approvalRequests' &&
      row.sourceId === requestId &&
      row.recipientId === recipientId,
  );
  if (existing.length) return;
  await h.services.lifecycles.create(
    'acknowledgements',
    {
      sourceLifecycle: 'approvalRequests',
      sourceId: requestId,
      recipientId,
      title: 'Contract C-17 approved',
      blocking: false,
    },
    { actor: SYSTEM_ACTOR },
  );
}

describe('scenario 25: carbon copy and read confirmation', () => {
  describe('carbon copy of an approved request (the approvalRequests contract)', () => {
    it('is created unread, delivered by an effect, and read by its recipient', async () => {
      const h = setUp();
      await carbonCopy(h, '42', 'sales-head');
      await carbonCopy(h, '42', 'sales-head'); // retried by the approval effect

      expect(h.all('acknowledgements')).toHaveLength(1);
      let copy = copyOf(h, '42', 'sales-head');
      // Delivery is recorded apart from reading: a state the system moves,
      // a timestamp, an effect run, and one message.
      expect(copy.status).toBe('delivered');
      expect(copy.deliveredAt).toBe(h.now().toISOString());
      expect(copy.readAt).toBeUndefined();
      expect(h.messagesTo('sales-head')).toEqual([
        'For your information: Contract C-17 approved',
      ]);
      const { effectRuns } = await h.runtime.history(
        'acknowledgements',
        copy.id,
      );
      expect(effectRuns.map((run) => [run.effect, run.status])).toEqual([
        ['acknowledgements.deliver', 'succeeded'],
      ]);

      h.advance({ hours: 3 });
      copy = (await h.fire(
        'acknowledgements',
        copy.id,
        'read',
        {},
        'sales-head',
      )) as Acknowledgement;
      expect(copy.status).toBe('read');
      expect(copy.readAt).toBe(h.now().toISOString());
      expect(await h.history('acknowledgements', copy.id)).toEqual([
        '$create',
        'markDelivered',
        'read',
      ]);
    });

    it('grants sight of the source and no decision', async () => {
      const h = setUp();
      await carbonCopy(h, '42', 'sales-head');
      const copy = copyOf(h, '42', 'sales-head');

      expect(
        await h.allowed('acknowledgements', copy.id, 'sales-head'),
      ).toEqual(['read']);
      expect(await h.allowed('acknowledgements', copy.id, 'outsider')).toEqual(
        [],
      );
      // A non-blocking copy has nothing to confirm, so "confirm" cannot stand in for "approve".
      await h.fire('acknowledgements', copy.id, 'read', {}, 'sales-head');
      await expect(
        h.fire('acknowledgements', copy.id, 'confirm', {}, 'sales-head'),
      ).rejects.toMatchObject({
        code: 'GUARD_REJECTED',
        blockers: [{ code: 'nothingToConfirm' }],
      });

      expect(
        await canViewSource(
          h.services.records,
          'sales-head',
          'approvalRequests',
          '42',
        ),
      ).toBe(true);
      expect(
        await canViewSource(
          h.services.records,
          'outsider',
          'approvalRequests',
          '42',
        ),
      ).toBe(false);
      expect(
        await canViewSource(
          h.services.records,
          'sales-head',
          'approvalRequests',
          '43',
        ),
      ).toBe(false);
    });

    it('limitation: runtime.create has no uniqueness or validation hook, so a second create duplicates the copy', async () => {
      const h = setUp();
      const values = {
        sourceLifecycle: 'approvalRequests',
        sourceId: '42',
        recipientId: 'sales-head',
        title: 'Contract C-17 approved',
        blocking: false,
      };
      await h.services.lifecycles.create('acknowledgements', values, {
        actor: SYSTEM_ACTOR,
      });
      await h.services.lifecycles.create('acknowledgements', values, {
        actor: SYSTEM_ACTOR,
      });
      // Only the caller's list-then-create keeps it to one; two workers
      // running that check at once would both create. A unique index on
      // (sourceLifecycle, sourceId, recipientId) is the real guarantee.
      expect(h.all('acknowledgements')).toHaveLength(2);
      expect(h.messagesTo('sales-head')).toHaveLength(2);
    });

    it('limitation: a copy inserted inside another transaction gets no $create entry and no delivery', async () => {
      const h = setUp();
      const row = await h.services.records.insert(
        SCENARIO_COLLECTIONS.acknowledgements,
        {
          sourceLifecycle: 'approvalRequests',
          sourceId: '42',
          recipientId: 'sales-head',
          title: 'Contract C-17 approved',
          blocking: false,
          status: 'unread',
          statusChangedAt: h.now().toISOString(),
          lifecycleVersion: 1,
        },
      );
      expect(await h.history('acknowledgements', row.id)).toEqual([]);
      expect(h.messagesTo('sales-head')).toEqual([]);
      // No transition re-runs delivery, and markDelivered — meant only as
      // the deliver effect's continuation — is open to any system caller,
      // which could record a delivery that never happened.
      expect(await h.allowed('acknowledgements', row.id, SYSTEM_ACTOR)).toEqual(
        ['markDelivered', 'revoke'],
      );
    });

    it('limitation: opening it a second time is refused rather than ignored', async () => {
      const h = setUp();
      await carbonCopy(h, '42', 'sales-head');
      const copy = copyOf(h, '42', 'sales-head');
      await h.fire('acknowledgements', copy.id, 'read', {}, 'sales-head');
      await expect(
        h.fire('acknowledgements', copy.id, 'read', {}, 'sales-head'),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    });
  });

  describe('notice variants', () => {
    it('notify only: effective at once, copies owe nothing and are never reminded', async () => {
      const h = setUp();
      const notice = await publish(h, 'notify', ['u1', 'u2']);
      expect(notice.status).toBe('effective');
      expect(copyOf(h, notice.id, 'u1')).toMatchObject({
        kind: 'notify',
        blocking: false,
        status: 'delivered',
      });
      expect(h.messagesTo('u1')).toEqual([
        'For your information: Travel policy 2027',
      ]);

      h.advance({ days: 5 });
      expect(await h.runtime.runTriggers()).toBe(0);
      expect(h.messagesTo('u1')).toHaveLength(1);
    });

    it('read receipt: effective at once; the unread are reminded until they open it, and the publisher sees who has', async () => {
      const h = setUp({
        acknowledgements: { remindAfterHours: 24, maxReminders: 2 },
      });
      const notice = await publish(h, 'receipt', ['u1', 'u2']);
      expect(notice.status).toBe('effective');

      await h.fire(
        'acknowledgements',
        copyOf(h, notice.id, 'u1').id,
        'read',
        {},
        'u1',
      );
      h.advance({ hours: 25 });
      expect(await h.runtime.runTriggers()).toBe(1);
      expect(h.messagesTo('u2')).toEqual([
        'Please read: Travel policy 2027',
        'Reminder 1: Travel policy 2027',
      ]);
      expect(h.messagesTo('u1')).toHaveLength(1);

      h.advance({ hours: 25 });
      expect(await h.runtime.runTriggers()).toBe(1);
      h.advance({ hours: 25 });
      expect(await h.runtime.runTriggers()).toBe(0); // maxReminders reached
      expect(copyOf(h, notice.id, 'u2').reminders).toBe(2);

      const receipts = (h.all('acknowledgements') as Acknowledgement[])
        .filter((copy) => copy.sourceId === String(notice.id))
        .map((copy) => [copy.recipientId, copy.status]);
      expect(receipts).toEqual([
        ['u1', 'read'],
        ['u2', 'delivered'],
      ]);
    });

    it('all confirm before continuing: collecting until the last confirmation, which the system acts on', async () => {
      const h = setUp();
      const notice = await publish(h, 'confirmAll', ['u1', 'u2']);
      expect(notice.status).toBe('collecting');
      expect(copyOf(h, notice.id, 'u1')).toMatchObject({
        kind: 'confirm',
        blocking: true,
      });

      const u1 = copyOf(h, notice.id, 'u1');
      await h.fire('acknowledgements', u1.id, 'read', {}, 'u1');
      await h.fire('acknowledgements', u1.id, 'confirm', {}, 'u1');
      expect(h.get('notices', notice.id).status).toBe('collecting');
      // The publisher cannot short-cut it either.
      await expect(
        h.fire('notices', notice.id, 'becomeEffective', {}, 'hr'),
      ).rejects.toMatchObject({
        code: 'GUARD_REJECTED',
        message: 'Waiting for 1 confirmation(s): u2.',
      });

      await h.fire(
        'acknowledgements',
        copyOf(h, notice.id, 'u2').id,
        'confirm',
        {},
        'u2',
      );
      const effective = h.get('notices', notice.id);
      expect(effective.status).toBe('effective');
      expect(effective.effectiveAt).toBe(h.now().toISOString());
      const log = await h.runtime.history('notices', notice.id);
      expect(
        log.transitions.map((entry) => [entry.transition, entry.actorId]),
      ).toEqual([
        ['$create', 'hr'],
        ['publish', 'hr'],
        ['becomeEffective', 'system'],
      ]);
    });

    it('adding a person while collecting widens "everyone": the old last confirmation no longer completes it', async () => {
      const h = setUp();
      const notice = await publish(h, 'confirmAll', ['u1', 'u2']);
      await h.fire(
        'acknowledgements',
        copyOf(h, notice.id, 'u1').id,
        'confirm',
        {},
        'u1',
      );

      await h.fire(
        'notices',
        notice.id,
        'addRecipients',
        { recipientIds: ['u3', 'u1'] },
        'hr',
      );
      expect(h.get('notices', notice.id).recipientIds).toEqual([
        'u1',
        'u2',
        'u3',
      ]);
      expect(copyOf(h, notice.id, 'u3')).toMatchObject({
        blocking: true,
        status: 'delivered',
      });
      expect(h.all('acknowledgements')).toHaveLength(3); // u1 is not copied twice

      await h.fire(
        'acknowledgements',
        copyOf(h, notice.id, 'u2').id,
        'confirm',
        {},
        'u2',
      );
      expect(h.get('notices', notice.id).status).toBe('collecting');
      await h.fire(
        'acknowledgements',
        copyOf(h, notice.id, 'u3').id,
        'confirm',
        {},
        'u3',
      );
      expect(h.get('notices', notice.id).status).toBe('effective');
    });

    it('race with the last confirmation: a becomeEffective decided on the list before the addition conflicts', async () => {
      const h = setUp();
      const notice = await publish(h, 'confirmAll', ['u1', 'u2']);
      await h.fire(
        'acknowledgements',
        copyOf(h, notice.id, 'u1').id,
        'confirm',
        {},
        'u1',
      );
      // The last confirmation commits; its effect reads the notice ...
      const seen = h.get('notices', notice.id);
      // ... and before its decision commits, the publisher adds u3.
      // The memory store serializes transactions, so the interleaving is
      // replayed with the version the effect read: a database store fails
      // the same conditional update.
      await h.fire(
        'notices',
        notice.id,
        'addRecipients',
        { recipientIds: ['u3'] },
        'hr',
      );
      await h.fire(
        'acknowledgements',
        copyOf(h, notice.id, 'u2').id,
        'confirm',
        {},
        'u2',
      );
      await expect(
        h.fire('notices', notice.id, 'becomeEffective', {}, SYSTEM_ACTOR, {
          expect: { version: seen.lifecycleVersion as number },
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      // Decided again on the current list, it waits for u3.
      expect(h.get('notices', notice.id).status).toBe('collecting');
      await expect(
        h.fire('notices', notice.id, 'becomeEffective', {}, SYSTEM_ACTOR),
      ).rejects.toMatchObject({
        code: 'GUARD_REJECTED',
        message: 'Waiting for 1 confirmation(s): u3.',
      });
    });

    it('adding a person after the last confirmation leaves it effective and asks the newcomer to confirm without blocking', async () => {
      const h = setUp();
      const notice = await publish(h, 'confirmAll', ['u1']);
      await h.fire(
        'acknowledgements',
        copyOf(h, notice.id, 'u1').id,
        'confirm',
        {},
        'u1',
      );
      expect(h.get('notices', notice.id).status).toBe('effective');

      await h.fire(
        'notices',
        notice.id,
        'addRecipients',
        { recipientIds: ['u3'] },
        'hr',
      );
      expect(h.get('notices', notice.id).status).toBe('effective');
      const u3 = copyOf(h, notice.id, 'u3');
      expect(u3).toMatchObject({ kind: 'confirm', blocking: false });
      await h.fire('acknowledgements', u3.id, 'confirm', {}, 'u3');
      expect(copyOf(h, notice.id, 'u3').status).toBe('confirmed');
      // The confirmation told nobody: it was not blocking.
      const runs = (await h.runtime.history('acknowledgements', u3.id))
        .effectRuns;
      expect(
        runs.find((run) => run.effect === 'acknowledgements.notifySource')
          ?.result,
      ).toEqual({ told: false });
    });

    it('withdrawing revokes the copies: sight is gone and a late confirmation is refused', async () => {
      const h = setUp();
      const notice = await publish(h, 'confirmAll', ['u1', 'u2']);
      const u1 = copyOf(h, notice.id, 'u1');
      await h.fire('acknowledgements', u1.id, 'confirm', {}, 'u1');
      await h.fire('notices', notice.id, 'withdraw', {}, 'hr');

      expect(copyOf(h, notice.id, 'u1').status).toBe('confirmed'); // kept as a fact
      expect(copyOf(h, notice.id, 'u2').status).toBe('revoked');
      await expect(
        h.fire(
          'acknowledgements',
          copyOf(h, notice.id, 'u2').id,
          'confirm',
          {},
          'u2',
        ),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
      expect(
        await canViewSource(
          h.services.records,
          'u2',
          'notices',
          String(notice.id),
        ),
      ).toBe(false);
    });
  });

  describe('policies', () => {
    it('reminders: a blocking copy is reminded while unread and again while read but unconfirmed', async () => {
      const h = setUp({
        acknowledgements: { remindAfterHours: 24, maxReminders: 3 },
      });
      const notice = await publish(h, 'confirmAll', ['u1']);
      const u1 = copyOf(h, notice.id, 'u1');
      h.advance({ hours: 25 });
      expect(await h.runtime.runTriggers()).toBe(1);
      await h.fire('acknowledgements', u1.id, 'read', {}, 'u1');
      h.advance({ hours: 25 });
      expect(await h.runtime.runTriggers()).toBe(1);
      expect(h.messagesTo('u1')).toEqual([
        'Please confirm you have read: Travel policy 2027',
        'Reminder 1: Travel policy 2027',
        'Reminder 2: Travel policy 2027',
      ]);
      await h.fire('acknowledgements', u1.id, 'confirm', {}, 'u1');
      h.advance({ days: 3 });
      expect(await h.runtime.runTriggers()).toBe(0);
    });

    it('comments: a recipient may comment; who sees it depends on commentVisibility', async () => {
      const h = setUp();
      const notice = await publish(h, 'confirmAll', ['u1', 'u2']);
      const u1 = copyOf(h, notice.id, 'u1');
      await h.fire('acknowledgements', u1.id, 'read', {}, 'u1');
      await h.fire(
        'acknowledgements',
        u1.id,
        'comment',
        { comment: 'Does this cover contractors?' },
        'u1',
      );
      await h.fire(
        'acknowledgements',
        copyOf(h, notice.id, 'u2').id,
        'confirm',
        { comment: 'OK' },
        'u2',
      );

      const copies = (h.all('acknowledgements') as Acknowledgement[]).filter(
        (copy) => copy.sourceId === String(notice.id),
      );
      const texts = (
        viewer: string,
        visibility: 'owner' | 'recipients',
      ): string[] =>
        visibleComments(copies, viewer, 'hr', visibility).map(
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
      // A comment is not a decision: the notice still waits for u1.
      expect(h.get('notices', notice.id).status).toBe('collecting');
    });

    it('comments: switched off by the administrator, both the comment and a comment on confirmation are refused', async () => {
      const h = setUp({ acknowledgements: { allowComments: false } });
      const notice = await publish(h, 'confirmAll', ['u1']);
      const u1 = copyOf(h, notice.id, 'u1');
      await h.fire('acknowledgements', u1.id, 'read', {}, 'u1');
      expect(await h.allowed('acknowledgements', u1.id, 'u1')).toEqual([
        'confirm',
      ]);
      await expect(
        h.fire('acknowledgements', u1.id, 'confirm', { comment: 'fine' }, 'u1'),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      await h.fire('acknowledgements', u1.id, 'confirm', {}, 'u1');
      expect(h.get('notices', notice.id).status).toBe('effective');
    });

    it('limitation: a system reminder bumps the version, so a confirmation sent from a page loaded before it conflicts', async () => {
      const h = setUp();
      const notice = await publish(h, 'confirmAll', ['u1']);
      const loaded = copyOf(h, notice.id, 'u1');
      h.advance({ hours: 25 });
      await h.runtime.runTriggers();
      await expect(
        h.fire('acknowledgements', loaded.id, 'confirm', {}, 'u1', {
          expect: { version: loaded.lifecycleVersion as number },
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('limitation: a comment is a self-transition and restarts the idle time, postponing the next reminder', async () => {
      const h = setUp({ acknowledgements: { remindAfterHours: 24 } });
      const notice = await publish(h, 'confirmAll', ['u1']);
      const u1 = copyOf(h, notice.id, 'u1');
      await h.fire('acknowledgements', u1.id, 'read', {}, 'u1');
      h.advance({ hours: 20 });
      await h.fire(
        'acknowledgements',
        u1.id,
        'comment',
        { comment: 'Question' },
        'u1',
      );
      h.advance({ hours: 5 }); // 25 hours since reading, 5 since the comment
      expect(await h.runtime.runTriggers()).toBe(0);
    });
  });
});
