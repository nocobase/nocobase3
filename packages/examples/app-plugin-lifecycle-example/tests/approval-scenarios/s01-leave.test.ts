// Scenario 1: the simplest single-level approval (张三 → 直属主管李四 → 结束).
import { LifecycleError } from '@nocobase/lifecycle';
import { describe, expect, it } from 'vitest';

import { leaveLifecycle } from '../../server/approval-scenarios/leave.js';
import { SCENARIO_COLLECTIONS } from '../../server/approval-scenarios/services.js';
import { createHarness, type Harness } from './harness.js';

const LEAVE = 'leaveRequests';

function setup(): Harness {
  return createHarness({
    org: {
      people: ['zhangsan', 'lisi', 'wangwu', 'zhaoliu', 'hr1'],
      managers: { zhangsan: 'lisi', wangwu: 'lisi' },
      roles: { hr: ['hr1'] },
    },
    lifecycles: [leaveLifecycle],
  });
}

async function draft(
  h: Harness,
  applicantId = 'zhangsan',
  actor = applicantId,
): Promise<string> {
  const record = await h.create(
    LEAVE,
    { applicantId, days: 2, reason: 'Family matters', approverId: null },
    actor,
  );
  return String(record.id);
}

async function refusal(promise: Promise<unknown>): Promise<LifecycleError> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(LifecycleError);
  return error as LifecycleError;
}

describe('scenario 1 · basic loop: submit, approve or reject, tell the applicant', () => {
  it('approval only: the manager approves with an optional comment, the applicant is told', async () => {
    const h = setup();
    const id = await draft(h);
    const pending = await h.fire(LEAVE, id, 'submit', {}, 'zhangsan');
    expect(pending).toMatchObject({ status: 'pending', approverId: 'lisi' });
    expect(h.messagesTo('lisi')).toEqual([`Leave request ${id} awaits you`]);

    const approved = await h.fire(
      LEAVE,
      id,
      'approve',
      { comment: 'Enjoy.' },
      'lisi',
    );
    expect(approved).toMatchObject({
      decidedBy: 'lisi',
      decisionComment: 'Enjoy.',
    });
    expect(h.messagesTo('zhangsan')).toContain(`Leave request ${id}: approved`);
  });

  it('rejection needs a reason and is final; asking again is a new request', async () => {
    const h = setup();
    const id = await draft(h);
    await h.fire(LEAVE, id, 'submit', {}, 'zhangsan');
    const noReason = await refusal(h.fire(LEAVE, id, 'reject', {}, 'lisi'));
    expect(noReason.code).toBe('INVALID_INPUT');
    expect(noReason.problems).toEqual([
      { field: 'comment', message: 'Give a reason for rejecting.' },
    ]);

    const rejected = await h.fire(
      LEAVE,
      id,
      'reject',
      { comment: 'Release week.' },
      'lisi',
    );
    expect(rejected).toMatchObject({
      status: 'rejected',
      decisionComment: 'Release week.',
    });
    expect(h.messagesTo('zhangsan')).toEqual([`Leave request ${id}: rejected`]);
    expect(await h.allowed(LEAVE, id, 'zhangsan')).toEqual([]);

    const again = await draft(h);
    expect(again).not.toBe(id);
    expect(h.get(LEAVE, id).status).toBe('rejected');
  });

  it('the decision and its comment are the log entry: history explains who decided what', async () => {
    const h = setup();
    const id = await draft(h);
    await h.fire(LEAVE, id, 'submit', {}, 'zhangsan');
    await h.fire(LEAVE, id, 'reject', { comment: 'Release week.' }, 'lisi');
    const { transitions } = await h.runtime.history(LEAVE, id);
    expect(
      transitions.map(({ transition, actorId, input }) => ({
        transition,
        actorId,
        input,
      })),
    ).toEqual([
      { transition: '$create', actorId: 'zhangsan', input: {} },
      { transition: 'submit', actorId: 'zhangsan', input: {} },
      {
        transition: 'reject',
        actorId: 'lisi',
        input: { comment: 'Release week.' },
      },
    ]);
  });
});

describe('scenario 1 · variant: approved, then the leave must still be registered', () => {
  it('approval and registration are separate states; registration follows as an effect', async () => {
    const h = setup();
    const id = await draft(h);
    await h.fire(LEAVE, id, 'submit', {}, 'zhangsan');
    const done = await h.fire(LEAVE, id, 'approve', {}, 'lisi');
    expect(done).toMatchObject({
      status: 'registered',
      registrationRef: `leave-registration:${id}`,
    });
    expect(await h.history(LEAVE, id)).toEqual([
      '$create',
      'submit',
      'approve',
      'registrationSucceeded',
    ]);
  });

  it('a failed registration is not a rejection: it waits for HR, and a retry does not re-notify', async () => {
    const h = setup();
    h.external.outages.set('step:registerLeave', 2); // both attempts fail
    const id = await draft(h);
    await h.fire(LEAVE, id, 'submit', {}, 'zhangsan');
    const failed = await h.fire(LEAVE, id, 'approve', {}, 'lisi');
    expect(failed).toMatchObject({
      status: 'registrationFailed',
      decidedBy: 'lisi',
    });
    expect(await h.allowed(LEAVE, id, 'zhangsan')).toEqual([]);
    expect(await h.allowed(LEAVE, id, 'hr1')).toEqual(['retryRegistration']);

    const registered = await h.fire(LEAVE, id, 'retryRegistration', {}, 'hr1');
    expect(registered.status).toBe('registered');
    expect(h.messagesTo('zhangsan')).toEqual([`Leave request ${id}: approved`]);
    // Same business key on every run, so the HR system can deduplicate.
    expect(
      h.external.calls.filter((call) => call.startsWith('step:registerLeave')),
    ).toEqual([
      `step:registerLeave:leave-registration:${id}`,
      `step:registerLeave:leave-registration:${id}`,
      `step:registerLeave:leave-registration:${id}`,
    ]);
  });
});

describe('scenario 1 · who may submit and decide', () => {
  it('only the applicant submits; only the assigned, active manager decides', async () => {
    const h = setup();
    const id = await draft(h);
    expect(
      (await refusal(h.fire(LEAVE, id, 'submit', {}, 'lisi'))).blockers[0]
        ?.code,
    ).toBe('applicantOnly');
    await h.fire(LEAVE, id, 'submit', {}, 'zhangsan');
    expect(await h.allowed(LEAVE, id, 'zhangsan')).toEqual([]);
    expect(await h.allowed(LEAVE, id, 'zhaoliu')).toEqual([]);
    expect(await h.allowed(LEAVE, id, 'lisi')).toEqual(['approve', 'reject']);
    expect(
      (await refusal(h.fire(LEAVE, id, 'approve', {}, 'zhaoliu'))).blockers[0]
        ?.code,
    ).toBe('approverOnly');
  });

  it('no manager is never an approval: submitting is refused', async () => {
    const h = setup();
    const id = await draft(h, 'zhaoliu');
    const error = await refusal(h.fire(LEAVE, id, 'submit', {}, 'zhaoliu'));
    expect(error.blockers[0]?.code).toBe('noApprover');
    expect(h.get(LEAVE, id).status).toBe('draft');
  });

  it('the approver is fixed at submission: a later manager change does not move the responsibility', async () => {
    const h = setup();
    const id = await draft(h);
    await h.fire(LEAVE, id, 'submit', {}, 'zhangsan');
    h.org.setManager('zhangsan', 'wangwu');
    expect(await h.allowed(LEAVE, id, 'wangwu')).toEqual([]);
    expect(await h.allowed(LEAVE, id, 'lisi')).toEqual(['approve', 'reject']);
  });
});

describe('scenario 1 · variant: repeated operations by applicant or approver', () => {
  it('a repeated submit with the same requestId is a replay, not a second submission', async () => {
    const h = setup();
    const id = await draft(h);
    const options = { actor: { id: 'zhangsan' }, requestId: 'form-1' };
    const first = await h.runtime.fire(LEAVE, id, 'submit', options);
    const second = await h.runtime.fire(LEAVE, id, 'submit', options);
    expect(second.replayed).toBe(true);
    expect(second.entry.id).toBe(first.entry.id);
    expect(await h.history(LEAVE, id)).toEqual(['$create', 'submit']);
    expect(h.messagesTo('lisi')).toHaveLength(1);
  });

  it('a double-clicked approval with a fresh requestId is refused by state, not counted twice', async () => {
    const h = setup();
    const id = await draft(h);
    await h.fire(LEAVE, id, 'submit', {}, 'zhangsan');
    await h.fire(LEAVE, id, 'approve', {}, 'lisi');
    const error = await refusal(h.fire(LEAVE, id, 'approve', {}, 'lisi'));
    expect(error.code).toBe('INVALID_STATE');
    expect(
      (await h.history(LEAVE, id)).filter((name) => name === 'approve'),
    ).toHaveLength(1);
  });

  it('a decision from a stale page (expect.version) is refused with CONFLICT', async () => {
    const h = setup();
    const id = await draft(h);
    await h.fire(LEAVE, id, 'submit', {}, 'zhangsan');
    const shown = (await h.runtime.view(LEAVE, id, { id: 'lisi' })).version;
    // Tab A approves; tab B, still showing the old version, tries to reject.
    await h.runtime.fire(LEAVE, id, 'approve', {
      actor: { id: 'lisi' },
      expect: { version: shown },
    });
    const error = await refusal(
      h.runtime.fire(LEAVE, id, 'reject', {
        actor: { id: 'lisi' },
        input: { comment: 'Changed my mind' },
        expect: { version: shown },
      }),
    );
    expect(error.code).toBe('CONFLICT');
    expect(h.get(LEAVE, id).status).toBe('registered');
  });
});

describe('scenario 1 · limitations', () => {
  it('limitation: runtime.create() asks no guard, so anyone can create a request in someone else’s name', async () => {
    const h = setup();
    const id = await draft(h, 'zhangsan', 'wangwu');
    expect(h.get(LEAVE, id)).toMatchObject({
      applicantId: 'zhangsan',
      status: 'draft',
    });
    // The submit guard still protects the next step.
    expect(
      (await refusal(h.fire(LEAVE, id, 'submit', {}, 'wangwu'))).blockers[0]
        ?.code,
    ).toBe('applicantOnly');
  });

  it('limitation: editing the content outside a transition does not bump the version, so expect.version does not pin what was approved', async () => {
    const h = setup();
    const id = await draft(h);
    await h.fire(LEAVE, id, 'submit', {}, 'zhangsan');
    const shown = (await h.runtime.view(LEAVE, id, { id: 'lisi' })).version;
    // An edit form writes the record directly while it is pending.
    h.store.patchRecord(SCENARIO_COLLECTIONS.leaveRequests, id, { days: 20 });
    const result = await h.runtime.fire(LEAVE, id, 'approve', {
      actor: { id: 'lisi' },
      expect: { version: shown },
    });
    expect(result.replayed).toBeUndefined();
    expect(h.get(LEAVE, id)).toMatchObject({ status: 'registered', days: 20 });
  });

  it('limitation: a replayed requestId is matched per record only, not per transition or actor', async () => {
    const h = setup();
    const id = await draft(h);
    await h.runtime.fire(LEAVE, id, 'submit', {
      actor: { id: 'zhangsan' },
      requestId: 'shared-key',
    });
    const approve = await h.runtime.fire(LEAVE, id, 'approve', {
      actor: { id: 'lisi' },
      requestId: 'shared-key',
    });
    expect(approve.replayed).toBe(true);
    expect(approve.entry.transition).toBe('submit');
    expect(h.get(LEAVE, id).status).toBe('pending');
  });

  it('limitation: a departed approver leaves the request stuck; the minimal lifecycle has no reassignment', async () => {
    const h = setup();
    const id = await draft(h);
    await h.fire(LEAVE, id, 'submit', {}, 'zhangsan');
    h.org.deactivate('lisi');
    h.org.setManager('zhangsan', 'wangwu');
    expect(
      (await refusal(h.fire(LEAVE, id, 'approve', {}, 'lisi'))).blockers[0]
        ?.code,
    ).toBe('approverInactive');
    expect(await h.allowed(LEAVE, id, 'wangwu')).toEqual([]);
    expect(await h.allowed(LEAVE, id, 'zhangsan')).toEqual([]);
  });
});
