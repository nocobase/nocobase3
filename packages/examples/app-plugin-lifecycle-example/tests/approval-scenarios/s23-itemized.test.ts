// Scenario 23: several objects in one request, decided line by line.
import type { Lifecycle, LifecycleTypes, RecordId } from '@nocobase/lifecycle';
import { describe, expect, it } from 'vitest';

import {
  lineHash,
  reimbursementLifecycle,
  requestRejectedLinesAgain,
  sheetHash,
  type LineOutcome,
  type Reimbursement,
  type ReimbursementLine,
  type ReimbursementParameters,
} from '../../server/approval-scenarios/reimbursement.js';
import { SCENARIO_COLLECTIONS } from '../../server/approval-scenarios/services.js';
import { createHarness, type Harness } from './harness.js';

const ORG = {
  people: ['alice', 'bob', 'tina', 'ivan', 'fiona'],
  managers: { alice: 'bob' },
  roles: {
    travelApprover: ['tina'],
    itApprover: ['ivan'],
    finance: ['fiona'],
  },
};

function setup(overrides: Partial<ReimbursementParameters> = {}): {
  h: Harness;
  parameters: Record<string, unknown>;
} {
  const parameters: Record<string, unknown> = {
    routing: 'byCategory',
    categoryRoles: { travel: 'travelApprover', equipment: 'itApprover' },
    ...overrides,
  };
  const h = createHarness({
    org: ORG,
    lifecycles: [
      reimbursementLifecycle as unknown as Lifecycle<LifecycleTypes>,
    ],
    parameters: { reimbursements: parameters },
  });
  return { h, parameters };
}

function line(
  id: string,
  category: string,
  amountCents: number,
): ReimbursementLine {
  return {
    id,
    category,
    description: `${category} ${id}`,
    amountCents,
    approverId: null,
    contentHash: null,
    decision: null,
  };
}

async function submitted(
  h: Harness,
  lines: ReimbursementLine[],
): Promise<RecordId> {
  const record = await h.create(
    'reimbursements',
    { title: 'Trip to Shanghai', applicantId: 'alice', lines },
    'alice',
  );
  await h.fire('reimbursements', record.id, 'submit', {}, 'alice');
  return record.id;
}

function sheet(h: Harness, id: RecordId): Reimbursement {
  return h.get('reimbursements', id) as Reimbursement;
}

function lineOf(h: Harness, id: RecordId, lineId: string): ReimbursementLine {
  const found = sheet(h, id).lines.find((candidate) => candidate.id === lineId);
  if (!found) throw new Error(`No line ${lineId}`);
  return found;
}

/** Decides a line on the content the approver is shown now. */
async function decide(
  h: Harness,
  id: RecordId,
  lineId: string,
  outcome: LineOutcome,
  actor: string,
  extra: Record<string, number | string> = {},
): Promise<Reimbursement> {
  const comment: Record<string, string> =
    outcome === 'approved' ? {} : { comment: 'See policy.' };
  return (await h.fire(
    'reimbursements',
    id,
    'decideLine',
    {
      lineId,
      outcome,
      contentHash: lineOf(h, id, lineId).contentHash ?? '',
      ...comment,
      ...extra,
    },
    actor,
  )) as Reimbursement;
}

async function statesOf(h: Harness, id: RecordId): Promise<string[]> {
  return (await h.runtime.history('reimbursements', id)).transitions.map(
    (entry) => entry.to,
  );
}

describe('scenario 23: itemized reimbursement', () => {
  describe('whole-sheet decision', () => {
    it('a single approver decides every line at once, bound to the sheet hash', async () => {
      const { h } = setup({ routing: 'single' });
      const id = await submitted(h, [
        line('t1', 'travel', 30_000),
        line('e1', 'equipment', 50_000),
      ]);
      expect(sheet(h, id).lines.map((l) => l.approverId)).toEqual([
        'bob',
        'bob',
      ]);

      const done = (await h.fire(
        'reimbursements',
        id,
        'decideSheet',
        { outcome: 'approved', sheetHash: sheetHash(sheet(h, id).lines) },
        'bob',
      )) as Reimbursement;

      expect(await statesOf(h, id)).toEqual([
        'draft',
        'inReview',
        'approved',
        'paid',
      ]);
      expect(done.approvedTotalCents).toBe(80_000);
      expect(Object.keys(done.payments ?? {})).toEqual(['t1', 'e1']);
    });

    it('a whole-sheet decision on a sheet that is not the one shown is refused', async () => {
      const { h } = setup({ routing: 'single' });
      const id = await submitted(h, [line('t1', 'travel', 30_000)]);
      await expect(
        h.fire(
          'reimbursements',
          id,
          'decideSheet',
          { outcome: 'approved', sheetHash: 'stale' },
          'bob',
        ),
      ).rejects.toMatchObject({
        code: 'GUARD_REJECTED',
        blockers: [{ code: 'contentStale' }],
      });
    });

    it('when partial approval is not allowed, one rejected line rejects the whole sheet at once', async () => {
      const { h } = setup({ allowPartialApproval: false });
      const id = await submitted(h, [
        line('t1', 'travel', 30_000),
        line('e1', 'equipment', 50_000),
      ]);
      const rejected = await decide(h, id, 'e1', 'rejected', 'ivan');
      expect(rejected.status).toBe('rejected');
      // Tina's line was never decided, and now cannot be.
      await expect(
        decide(h, id, 't1', 'approved', 'tina'),
      ).rejects.toMatchObject({
        code: 'INVALID_STATE',
      });
      expect(h.external.payments.size).toBe(0);
    });
  });

  describe('per-line decisions with partial approval', () => {
    it('approves 8 of 10 lines: partially approved, with the approved total, paying only the approved lines', async () => {
      const { h } = setup();
      const lines = [
        ...[1, 2, 3, 4, 5].map((n) => line(`t${n}`, 'travel', n * 1_000)),
        ...[1, 2, 3, 4, 5].map((n) => line(`e${n}`, 'equipment', n * 10_000)),
      ];
      const id = await submitted(h, lines);
      for (const n of [1, 2, 3, 4, 5])
        await decide(h, id, `t${n}`, 'approved', 'tina');
      for (const n of [1, 2, 3])
        await decide(h, id, `e${n}`, 'approved', 'ivan');
      await decide(h, id, 'e4', 'rejected', 'ivan');
      const done = await decide(h, id, 'e5', 'rejected', 'ivan');

      expect(await statesOf(h, id)).toContain('partiallyApproved');
      expect(done.status).toBe('paid');
      expect(done.approvedTotalCents).toBe(15_000 + 60_000);
      expect(Object.keys(done.payments ?? {}).sort()).toEqual([
        'e1',
        'e2',
        'e3',
        't1',
        't2',
        't3',
        't4',
        't5',
      ]);
      expect(h.external.payments.size).toBe(8);
    });

    it('an approver may approve less than claimed, and the total follows', async () => {
      const { h } = setup();
      const id = await submitted(h, [
        line('t1', 'travel', 30_000),
        line('e1', 'equipment', 50_000),
      ]);
      await decide(h, id, 't1', 'approved', 'tina', { approvedCents: 20_000 });
      const done = await decide(h, id, 'e1', 'approved', 'ivan');
      expect(done.approvedTotalCents).toBe(70_000);
      expect(
        [...h.external.payments.values()].map((p) => p.amountCents).sort(),
      ).toEqual([20_000, 50_000]);
    });

    it('approving more than claimed is refused as input', async () => {
      const { h } = setup();
      const id = await submitted(h, [line('t1', 'travel', 30_000)]);
      await expect(
        decide(h, id, 't1', 'approved', 'tina', { approvedCents: 40_000 }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('every line rejected settles the sheet as rejected', async () => {
      const { h } = setup();
      const id = await submitted(h, [
        line('t1', 'travel', 30_000),
        line('e1', 'equipment', 50_000),
      ]);
      await decide(h, id, 't1', 'rejected', 'tina');
      const done = await decide(h, id, 'e1', 'rejected', 'ivan');
      expect(done.status).toBe('rejected');
      expect(done.approvedTotalCents).toBe(0);
    });

    it('a rejection or return needs a reason', async () => {
      const { h } = setup();
      const id = await submitted(h, [line('t1', 'travel', 30_000)]);
      await expect(
        h.fire(
          'reimbursements',
          id,
          'decideLine',
          {
            lineId: 't1',
            outcome: 'rejected',
            contentHash: lineOf(h, id, 't1').contentHash ?? '',
          },
          'tina',
        ),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });
  });

  describe('different lines to different approvers', () => {
    it('routes each line by category and notifies each approver once per line content', async () => {
      const { h } = setup();
      const id = await submitted(h, [
        line('t1', 'travel', 30_000),
        line('e1', 'equipment', 50_000),
        line('m1', 'meals', 8_000),
      ]);
      expect(sheet(h, id).lines.map((l) => l.approverId)).toEqual([
        'tina',
        'ivan',
        'bob',
      ]);
      expect(h.messagesTo('tina')).toEqual([
        'To decide: Trip to Shanghai / t1',
      ]);
      expect(h.messagesTo('ivan')).toEqual([
        'To decide: Trip to Shanghai / e1',
      ]);
      expect(h.messagesTo('bob')).toEqual(['To decide: Trip to Shanghai / m1']);
    });

    it("one approver cannot decide another approver's line", async () => {
      const { h } = setup();
      const id = await submitted(h, [
        line('t1', 'travel', 30_000),
        line('e1', 'equipment', 50_000),
      ]);
      await expect(
        decide(h, id, 'e1', 'approved', 'tina'),
      ).rejects.toMatchObject({
        blockers: [{ code: 'notYourLine' }],
      });
    });

    it('available() offers a line decision only to someone with a line waiting', async () => {
      const { h } = setup();
      const id = await submitted(h, [
        line('t1', 'travel', 30_000),
        line('e1', 'equipment', 50_000),
      ]);
      expect(await h.allowed('reimbursements', id, 'tina')).toContain(
        'decideLine',
      );
      await decide(h, id, 't1', 'approved', 'tina');
      expect(await h.allowed('reimbursements', id, 'tina')).not.toContain(
        'decideLine',
      );
      expect(await h.allowed('reimbursements', id, 'ivan')).toContain(
        'decideLine',
      );
    });

    it('a line nobody can decide refuses the submission instead of passing it', async () => {
      const { h } = setup();
      h.org.deactivate('tina');
      const record = await h.create(
        'reimbursements',
        {
          title: 'Trip',
          applicantId: 'alice',
          lines: [line('t1', 'travel', 30_000)],
        },
        'alice',
      );
      await expect(
        h.fire('reimbursements', record.id, 'submit', {}, 'alice'),
      ).rejects.toMatchObject({
        blockers: [{ code: 'noApprover' }],
      });
    });

    it('limitation: approvers of different lines still conflict, because decisions serialize on the sheet version', async () => {
      const { h } = setup();
      const id = await submitted(h, [
        line('t1', 'travel', 30_000),
        line('e1', 'equipment', 50_000),
      ]);
      const shown = sheet(h, id).lifecycleVersion;
      await h.fire(
        'reimbursements',
        id,
        'decideLine',
        {
          lineId: 't1',
          outcome: 'approved',
          contentHash: lineOf(h, id, 't1').contentHash ?? '',
        },
        'tina',
        { expect: { version: shown } },
      );
      // Ivan's page was loaded at the same version, for a different line.
      await expect(
        h.fire(
          'reimbursements',
          id,
          'decideLine',
          {
            lineId: 'e1',
            outcome: 'approved',
            contentHash: lineOf(h, id, 'e1').contentHash ?? '',
          },
          'ivan',
          { expect: { version: shown } },
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      // Reloaded, his decision goes through and settles the sheet.
      const done = await decide(h, id, 'e1', 'approved', 'ivan');
      expect(done.status).toBe('paid');
    });
  });

  describe('partial return', () => {
    it('returned lines go back to the applicant while the other decisions stand', async () => {
      const { h } = setup();
      const id = await submitted(h, [
        line('t1', 'travel', 30_000),
        line('e1', 'equipment', 50_000),
      ]);
      const kept = (await decide(h, id, 't1', 'approved', 'tina')).lines[0]
        .decision;
      const returned = await decide(h, id, 'e1', 'returned', 'ivan');
      expect(returned.status).toBe('returned');

      const resubmitted = (await h.fire(
        'reimbursements',
        id,
        'resubmit',
        {
          lines: [
            {
              id: 'e1',
              category: 'equipment',
              description: 'Monitor, with receipt',
              amountCents: 45_000,
            },
          ],
        },
        'alice',
      )) as Reimbursement;
      expect(resubmitted.status).toBe('inReview');
      expect(resubmitted.round).toBe(2);
      expect(resubmitted.lines[0].decision).toEqual(kept);
      expect(resubmitted.lines[1].decision).toBeNull();
      expect(resubmitted.lines[1].contentHash).toBe(
        lineHash(resubmitted.lines[1]),
      );
      expect(h.messagesTo('ivan')).toHaveLength(2);
      expect(h.messagesTo('tina')).toHaveLength(1);

      const done = await decide(h, id, 'e1', 'approved', 'ivan');
      expect(done.approvedTotalCents).toBe(75_000);
      expect(done.status).toBe('paid');
    });

    it('the sheet stays in review until the lines not returned are decided too', async () => {
      const { h } = setup();
      const id = await submitted(h, [
        line('t1', 'travel', 30_000),
        line('e1', 'equipment', 50_000),
      ]);
      expect((await decide(h, id, 'e1', 'returned', 'ivan')).status).toBe(
        'inReview',
      );
      expect((await decide(h, id, 't1', 'approved', 'tina')).status).toBe(
        'returned',
      );
    });

    it('a decision on the content from before the return is refused', async () => {
      const { h } = setup();
      const id = await submitted(h, [line('e1', 'equipment', 50_000)]);
      const before = lineOf(h, id, 'e1').contentHash ?? '';
      await decide(h, id, 'e1', 'returned', 'ivan');
      await h.fire(
        'reimbursements',
        id,
        'resubmit',
        {
          lines: [
            {
              id: 'e1',
              category: 'equipment',
              description: 'Monitor',
              amountCents: 45_000,
            },
          ],
        },
        'alice',
      );
      await expect(
        h.fire(
          'reimbursements',
          id,
          'decideLine',
          { lineId: 'e1', outcome: 'approved', contentHash: before },
          'ivan',
        ),
      ).rejects.toMatchObject({ blockers: [{ code: 'contentStale' }] });
    });

    it('only returned lines can be changed on resubmission', async () => {
      const { h } = setup();
      const id = await submitted(h, [
        line('t1', 'travel', 30_000),
        line('e1', 'equipment', 50_000),
      ]);
      await decide(h, id, 't1', 'approved', 'tina');
      await decide(h, id, 'e1', 'returned', 'ivan');
      await expect(
        h.fire(
          'reimbursements',
          id,
          'resubmit',
          {
            lines: [
              {
                id: 't1',
                category: 'travel',
                description: 'More',
                amountCents: 90_000,
              },
            ],
          },
          'alice',
        ),
      ).rejects.toMatchObject({ blockers: [{ code: 'notReturned' }] });
    });

    it('a returned line can be dropped, which settles the sheet on what is left', async () => {
      const { h } = setup();
      const id = await submitted(h, [
        line('t1', 'travel', 30_000),
        line('e1', 'equipment', 50_000),
      ]);
      await decide(h, id, 't1', 'approved', 'tina');
      await decide(h, id, 'e1', 'returned', 'ivan');
      const done = (await h.fire(
        'reimbursements',
        id,
        'resubmit',
        { drop: ['e1'] },
        'alice',
      )) as Reimbursement;
      expect(done.lines.map((l) => l.id)).toEqual(['t1']);
      expect(await statesOf(h, id)).toEqual([
        'draft',
        'inReview',
        'inReview',
        'returned',
        'approved',
        'paid',
      ]);
    });

    it('with retained decisions turned off, a return sends every line back to its approver', async () => {
      const { h } = setup({ retainDecisionsOnReturn: false });
      const id = await submitted(h, [
        line('t1', 'travel', 30_000),
        line('e1', 'equipment', 50_000),
      ]);
      await decide(h, id, 't1', 'approved', 'tina');
      await decide(h, id, 'e1', 'returned', 'ivan');
      const again = (await h.fire(
        'reimbursements',
        id,
        'resubmit',
        {
          lines: [
            {
              id: 'e1',
              category: 'equipment',
              description: 'Monitor',
              amountCents: 45_000,
            },
          ],
        },
        'alice',
      )) as Reimbursement;
      expect(again.lines.map((l) => l.decision)).toEqual([null, null]);
      expect(await h.allowed('reimbursements', id, 'tina')).toContain(
        'decideLine',
      );
    });
  });

  describe('decisions bound to line content', () => {
    it('every decision records the content hash, the round and the decider', async () => {
      const { h } = setup();
      const id = await submitted(h, [
        line('t1', 'travel', 30_000),
        line('e1', 'equipment', 50_000),
      ]);
      const decided = (await decide(h, id, 't1', 'approved', 'tina')).lines[0];
      expect(decided.decision).toMatchObject({
        outcome: 'approved',
        by: 'tina',
        round: 1,
        contentHash: lineHash(decided),
      });
      const entry = (
        await h.runtime.history('reimbursements', id)
      ).transitions.at(-1);
      expect(entry).toMatchObject({
        transition: 'decideLine',
        actorId: 'tina',
        input: { lineId: 't1' },
      });
    });

    it('a line edited outside the lifecycle cannot be decided as it is', async () => {
      const { h } = setup();
      const id = await submitted(h, [line('t1', 'travel', 30_000)]);
      const current = sheet(h, id);
      h.store.patchRecord(SCENARIO_COLLECTIONS.reimbursements, id, {
        lines: current.lines.map((l) => ({ ...l, amountCents: 99_000 })),
      });
      await expect(
        decide(h, id, 't1', 'approved', 'tina'),
      ).rejects.toMatchObject({
        blockers: [{ code: 'contentChanged' }],
      });
    });

    it('rules frozen at submission: a parameter change later does not reach the sheet', async () => {
      const { h, parameters } = setup();
      const id = await submitted(h, [
        line('t1', 'travel', 30_000),
        line('e1', 'equipment', 50_000),
      ]);
      parameters.allowPartialApproval = false;
      await decide(h, id, 't1', 'rejected', 'tina');
      const done = await decide(h, id, 'e1', 'approved', 'ivan');
      expect(await statesOf(h, id)).toContain('partiallyApproved');
      expect(done.status).toBe('paid');
    });
  });

  describe('rejected lines asked for again', () => {
    it('a rejection is final on its sheet; the applicant asks again with a new sheet', async () => {
      const { h } = setup();
      const id = await submitted(h, [
        line('t1', 'travel', 30_000),
        line('e1', 'equipment', 50_000),
      ]);
      await decide(h, id, 't1', 'approved', 'tina');
      const settled = await decide(h, id, 'e1', 'rejected', 'ivan');
      expect(settled.status).toBe('paid');
      await expect(
        h.fire('reimbursements', id, 'resubmit', { drop: ['e1'] }, 'alice'),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });

      const followUp = await requestRejectedLinesAgain(
        h.services,
        settled,
        'alice',
      );
      const fresh = sheet(h, followUp.id);
      expect(fresh).toMatchObject({ status: 'draft', followUpOf: id });
      expect(fresh.lines.map((l) => l.id)).toEqual(['e1']);
      // The old rejection stays as it was made.
      expect(sheet(h, id).lines[1].decision?.outcome).toBe('rejected');
      await h.fire('reimbursements', followUp.id, 'submit', {}, 'alice');
      expect(
        (await decide(h, followUp.id, 'e1', 'approved', 'ivan')).status,
      ).toBe('paid');
    });
  });

  describe('payment per approved line', () => {
    it('a payment that fails part-way pays no line twice when finance retries', async () => {
      const { h } = setup();
      const id = await submitted(h, [
        line('t1', 'travel', 30_000),
        line('e1', 'equipment', 50_000),
      ]);
      h.external.balanceCents = 40_000;
      await decide(h, id, 't1', 'approved', 'tina');
      const failed = await decide(h, id, 'e1', 'approved', 'ivan');
      expect(failed.status).toBe('paymentFailed');
      expect(h.external.payments.size).toBe(1);

      h.external.balanceCents = 100_000;
      const paid = (await h.fire(
        'reimbursements',
        id,
        'retryPayment',
        {},
        'fiona',
      )) as Reimbursement;
      expect(paid.status).toBe('paid');
      expect(h.external.payments.size).toBe(2);
      expect(h.external.balanceCents).toBe(50_000);
      expect(paid.payments).toEqual({ t1: 'PAY-1', e1: 'PAY-2' });
    });

    it('limitation: the run idempotency key changes on a re-entry, so per-line business keys are required', async () => {
      const { h } = setup();
      const id = await submitted(h, [
        line('t1', 'travel', 30_000),
        line('e1', 'equipment', 50_000),
      ]);
      h.external.balanceCents = 40_000;
      await decide(h, id, 't1', 'approved', 'tina');
      await decide(h, id, 'e1', 'approved', 'ivan');
      h.external.balanceCents = 100_000;
      await h.fire('reimbursements', id, 'retryPayment', {}, 'fiona');
      const runs = (
        await h.runtime.history('reimbursements', id)
      ).effectRuns.filter(
        (run) => run.effect === 'reimbursements.payApprovedLines',
      );
      // Two runs, so two different `idempotencyKey`s (`reimbursements:<runId>`).
      expect(runs.map((run) => run.status)).toEqual(['failed', 'succeeded']);
      expect(new Set(runs.map((run) => run.id)).size).toBe(2);
    });

    it('limitation: which lines were already paid is not on the record until the payment effect succeeds', async () => {
      const { h } = setup();
      const id = await submitted(h, [
        line('t1', 'travel', 30_000),
        line('e1', 'equipment', 50_000),
      ]);
      h.external.balanceCents = 40_000;
      await decide(h, id, 't1', 'approved', 'tina');
      const failed = await decide(h, id, 'e1', 'approved', 'ivan');
      expect(failed.payments ?? null).toBeNull();
      expect(
        h.external.findPayment(
          `reimbursement:${String(id)}:t1:${lineOf(h, id, 't1').contentHash ?? ''}`,
        ),
      ).toBeDefined();
    });
  });

  describe('limitations of record-level time and availability', () => {
    it('limitation: a decision on any line restarts the idle clock for every other line', async () => {
      const { h } = setup({ remindAfterHours: 24 });
      const id = await submitted(h, [
        line('t1', 'travel', 30_000),
        line('e1', 'equipment', 50_000),
      ]);
      h.advance({ hours: 20 });
      await decide(h, id, 't1', 'approved', 'tina');
      h.advance({ hours: 10 });
      // Ivan has waited 30 hours, but the sheet changed 10 hours ago.
      expect(await h.runtime.runTriggers()).toBe(0);
      expect(
        h.messagesTo('ivan').filter((s) => s.startsWith('Reminder')),
      ).toEqual([]);
      h.advance({ hours: 15 });
      expect(await h.runtime.runTriggers()).toBe(1);
      expect(
        h.messagesTo('ivan').filter((s) => s.startsWith('Reminder')),
      ).toHaveLength(1);
      expect(
        h.messagesTo('tina').filter((s) => s.startsWith('Reminder')),
      ).toEqual([]);
    });

    it('limitation: available() says whether an actor may decide some line, not which lines', async () => {
      const { h } = setup({ routing: 'single' });
      const id = await submitted(h, [
        line('t1', 'travel', 30_000),
        line('e1', 'equipment', 50_000),
      ]);
      const offered = (
        await h.runtime.available('reimbursements', id, { id: 'bob' })
      ).filter((transition) => transition.name === 'decideLine');
      expect(offered).toHaveLength(1);
      expect(offered[0]).toMatchObject({ allowed: true });
      // The page works out the lines itself from the record.
      expect(
        sheet(h, id).lines.filter(
          (l) => l.approverId === 'bob' && l.decision === null,
        ),
      ).toHaveLength(2);
    });
  });
});
