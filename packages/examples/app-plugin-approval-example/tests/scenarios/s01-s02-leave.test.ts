// Scenarios 1 and 2: the leave request waits in `approving`
// while an approval run, a record of its own, goes through the stages and
// asks each stage's people; the run's end moves the request on in the same
// transaction.
import { describe, expect, it } from 'vitest';

import {
  compensatoryLifecycle,
  compensatoryApproval,
  leaveApproval,
  leaveLifecycle,
} from '../../server/scenarios/leave.js';
import { SCENARIO_COLLECTIONS } from '../../server/scenarios/services.js';
import { createHarness, refusal, type Harness } from '../support/harness.js';

const LEAVE = 'scenarioLeaves';

function setup(): Harness {
  return createHarness({
    org: {
      people: ['zhangsan', 'lisi', 'wangwu', 'zhaoliu', 'hr1', 'admin'],
      managers: { zhangsan: 'lisi', lisi: 'wangwu' },
      roles: { hr: ['hr1'], approvalAdmin: ['admin'] },
    },
    lifecycles: [leaveLifecycle as never, compensatoryLifecycle as never],
    approvals: [leaveApproval as never, compensatoryApproval as never],
  });
}

async function draft(
  h: Harness,
  applicantId = 'zhangsan',
  days = 2,
  actor = applicantId,
): Promise<string> {
  const record = await h.create(
    LEAVE,
    { applicantId, days, reason: 'Family matters', registrationRef: null },
    actor,
  );
  return String(record.id);
}

async function submitted(h: Harness, days = 2): Promise<string> {
  const id = await draft(h, 'zhangsan', days);
  await h.fire(LEAVE, id, 'submit', {}, 'zhangsan');
  return id;
}

describe('scenario 1 · basic loop', () => {
  it('submitting enters the manager stage, whose task asks lisi; approving moves the request on', async () => {
    const h = setup();
    const id = await submitted(h);
    expect(h.get(LEAVE, id).status).toBe('approving');
    expect(await h.stage(LEAVE, id)).toBe('manager');
    expect(await h.open(LEAVE, id)).toEqual(['lisi:pending']);
    expect(h.messagesTo('lisi')).toEqual([`Leave request ${id} awaits you`]);

    const answered = await h.answer(LEAVE, id, 'lisi', 'approve', 'Enjoy.');
    expect(answered.outcome).toBe('manager.approve');
    expect(h.get(LEAVE, id).status).toBe('registered');
    expect(h.messagesTo('zhangsan')).toEqual([`Leave request ${id}: approved`]);
    // Who decided, and what they said, is the task and the transition entry.
    const [task] = await h.tasks(LEAVE, id);
    expect(task).toMatchObject({
      assigneeId: 'lisi',
      actorId: 'lisi',
      answer: 'approve',
      comment: 'Enjoy.',
    });
    const { transitions } = await h.runtime.history(LEAVE, id);
    expect(
      transitions.map(({ transition, actorId }) => `${transition}:${actorId}`),
    ).toEqual([
      '$create:zhangsan',
      'submit:zhangsan',
      'approve:lisi',
      'registrationSucceeded:system',
    ]);
    // The stages are the run's, not the request's.
    expect(await h.runHistory(LEAVE, id)).toEqual([
      '$create',
      'manager.approve',
    ]);
  });

  it('rejection needs a reason and is final; asking again is a new request', async () => {
    const h = setup();
    const id = await submitted(h);
    expect(
      (await refusal(h.answer(LEAVE, id, 'lisi', 'reject', ''))).code,
    ).toBe('REASON_REQUIRED');
    expect(await h.open(LEAVE, id)).toEqual(['lisi:pending']);
    await h.answer(LEAVE, id, 'lisi', 'reject', 'Release week.');
    expect(h.get(LEAVE, id).status).toBe('rejected');
    expect(h.messagesTo('zhangsan')).toEqual([`Leave request ${id}: rejected`]);
    const { transitions } = await h.runtime.history(LEAVE, id);
    expect(transitions.at(-1)).toMatchObject({
      transition: 'reject',
      actorId: 'lisi',
      input: {
        answer: 'reject',
        comment: 'Release week.',
        stage: 'manager',
        outcome: 'rejected',
        changes: {},
      },
    });
    expect((await h.runs(LEAVE, id)).map((run) => run.status)).toEqual([
      'rejected',
    ]);
  });

  it("the stage conclusion and the run's end are system transitions: no page can fire them", async () => {
    const h = setup();
    const id = await submitted(h);
    expect(await h.allowed(LEAVE, id, 'lisi')).toEqual([]);
    expect(
      (await h.runtime.can(LEAVE, id, 'approve', { id: 'lisi' })).blockers[0]
        ?.code,
    ).toBe('NOT_MANUAL');
    const [run] = await h.runs(LEAVE, id);
    expect(
      (
        await h.runtime.can('approval:leave', run.id, 'manager.approve', {
          id: 'lisi',
        })
      ).blockers[0]?.code,
    ).toBe('NOT_MANUAL');
    expect(await h.actions(LEAVE, id, 'lisi')).toEqual([
      'lisi:respond',
      'lisi:transfer',
    ]);
  });
});

describe('scenario 1 · variant: approved, then the leave must still be registered', () => {
  it('a failed registration is not a rejection: it waits for HR, and a retry does not re-notify', async () => {
    const h = setup();
    h.external.outages.set('step:registerLeave', 2);
    const id = await submitted(h);
    await h.answer(LEAVE, id, 'lisi');
    expect(h.get(LEAVE, id).status).toBe('registrationFailed');
    // The approval stays approved; the execution failed.
    expect((await h.runs(LEAVE, id))[0].status).toBe('approved');
    expect(await h.allowed(LEAVE, id, 'hr1')).toEqual(['retryRegistration']);
    await h.fire(LEAVE, id, 'retryRegistration', {}, 'hr1');
    expect(h.get(LEAVE, id).status).toBe('registered');
    expect(h.messagesTo('zhangsan')).toEqual([`Leave request ${id}: approved`]);
  });
});

describe('scenario 1 · who may submit and decide', () => {
  it('only the applicant submits; only the assigned, active manager answers', async () => {
    const h = setup();
    const id = await draft(h);
    expect(
      (await refusal(h.fire(LEAVE, id, 'submit', {}, 'lisi'))).message,
    ).toContain('Only the applicant');
    await h.fire(LEAVE, id, 'submit', {}, 'zhangsan');
    const [task] = await h.tasks(LEAVE, id);
    for (const [person, code] of [
      ['zhaoliu', 'NOT_ASSIGNEE'],
      ['zhangsan', 'NOT_ASSIGNEE'],
    ] as const)
      expect(
        (
          await refusal(
            h.approvals.respond({
              taskId: task.id,
              actor: { id: person },
              answer: 'approve',
            }),
          )
        ).code,
      ).toBe(code);
    h.org.deactivate('lisi');
    expect((await refusal(h.answer(LEAVE, id, 'lisi'))).code).toBe('INACTIVE');
    expect(await h.stage(LEAVE, id)).toBe('manager');
  });

  it('no manager is never an approval: the stage refuses to open, and the submission rolls back', async () => {
    const h = setup();
    const id = await draft(h, 'zhaoliu');
    const error = await refusal(h.fire(LEAVE, id, 'submit', {}, 'zhaoliu'));
    expect(error.code).toBe('NO_ASSIGNEE');
    expect(h.get(LEAVE, id).status).toBe('draft');
    expect(await h.runs(LEAVE, id)).toEqual([]);
    expect(await h.history(LEAVE, id)).toEqual(['$create']);
  });

  it('the approver is fixed when the stage opens: a later manager change does not move it', async () => {
    const h = setup();
    const id = await submitted(h);
    h.org.setManager('zhangsan', 'wangwu');
    expect(await h.actions(LEAVE, id, 'wangwu')).toEqual([]);
    expect(await h.open(LEAVE, id)).toEqual(['lisi:pending']);
  });

  it('a departed approver no longer leaves it stuck: an administrator reassigns, and cannot decide', async () => {
    const h = setup();
    const id = await submitted(h);
    h.org.deactivate('lisi');
    const report = await h.approvals.reassign({
      from: 'lisi',
      to: 'wangwu',
      actor: { id: 'admin' },
      reason: 'lisi left',
    });
    expect(report.failed).toEqual([]);
    expect(await h.open(LEAVE, id)).toEqual(['wangwu:pending']);
    expect((await refusal(h.answer(LEAVE, id, 'admin'))).code).toBe(
      'NOT_ASSIGNEE',
    );
    await h.answer(LEAVE, id, 'wangwu');
    expect(h.get(LEAVE, id).status).toBe('registered');
  });
});

describe('scenario 1 · repeated and stale operations', () => {
  it('a repeated submit with the same requestId is a replay', async () => {
    const h = setup();
    const id = await draft(h);
    const options = { actor: { id: 'zhangsan' }, requestId: 'form-1' };
    await h.runtime.fire(LEAVE, id, 'submit', options);
    const second = await h.runtime.fire(LEAVE, id, 'submit', options);
    expect(second.replayed).toBe(true);
    expect(await h.open(LEAVE, id)).toEqual(['lisi:pending']);
    expect(h.messagesTo('lisi')).toHaveLength(1);
  });

  it('a double click is a replay under the same requestId, and refused under a new one', async () => {
    const h = setup();
    const id = await submitted(h);
    const [task] = await h.tasks(LEAVE, id);
    const click = { taskId: task.id, actor: { id: 'lisi' }, answer: 'approve' };
    await h.approvals.respond({ ...click, requestId: 'click-1' });
    expect(
      (await h.approvals.respond({ ...click, requestId: 'click-1' })).outcome,
    ).toBe('replayed');
    expect(
      (await refusal(h.approvals.respond({ ...click, requestId: 'click-2' })))
        .code,
    ).toBe('ALREADY_ANSWERED');
    expect(
      (await h.runHistory(LEAVE, id)).filter(
        (name) => name === 'manager.approve',
      ),
    ).toHaveLength(1);
  });

  it('a task shown before a withdrawal and resubmission cannot act on the new round', async () => {
    const h = setup();
    const id = await submitted(h);
    const [old] = await h.tasks(LEAVE, id);
    // The leave lifecycle has no withdraw; returning through the same stage
    // shows the same thing: the old stay's task is closed by its leave hook.
    await h.approvals.reassign({
      from: 'lisi',
      to: 'wangwu',
      actor: { id: 'admin' },
      reason: 'Covering',
    });
    expect(
      (
        await refusal(
          h.approvals.respond({
            taskId: old.id,
            actor: { id: 'lisi' },
            answer: 'approve',
          }),
        )
      ).code,
    ).toBe('TASK_CLOSED');
  });

  it('content edited outside a transition is caught: nobody can decide it as it is', async () => {
    const h = setup();
    const id = await submitted(h);
    const before = h.get(LEAVE, id);
    h.store.patchRecord(SCENARIO_COLLECTIONS.leaveRequests, id, { days: 20 });
    expect((await refusal(h.answer(LEAVE, id, 'lisi'))).code).toBe(
      'CONTENT_CHANGED',
    );
    expect(h.get(LEAVE, id).lifecycleVersion).toBe(before.lifecycleVersion);
  });

  it('limitation: runtime.create() still asks no guard; the submit guard protects the next step', async () => {
    const h = setup();
    const id = await draft(h, 'zhangsan', 2, 'wangwu');
    expect(h.get(LEAVE, id).status).toBe('draft');
    await expect(h.fire(LEAVE, id, 'submit', {}, 'wangwu')).rejects.toThrow(
      'Only the applicant',
    );
  });
});

describe('scenario 2 · conditional routing by leave days', () => {
  it('three days or fewer: the manager alone, and the plan says why the others were left out', async () => {
    const h = setup();
    const id = await submitted(h, 2);
    const [run] = await h.runs(LEAVE, id);
    expect(
      run.plan.map((entry) => [entry.stage, entry.included, entry.because]),
    ).toEqual([
      ['manager', true, null],
      ['deptManager', false, '2 days ≤ 3'],
      ['hr', false, '2 days ≤ 3'],
    ]);
    await h.answer(LEAVE, id, 'lisi');
    expect(h.get(LEAVE, id).status).toBe('registered');
  });

  it('above three days: manager → department manager → HR, each a state of the run while the request waits', async () => {
    const h = setup();
    const id = await submitted(h, 5);
    await h.answer(LEAVE, id, 'lisi');
    expect(await h.stage(LEAVE, id)).toBe('deptManager');
    expect(await h.open(LEAVE, id)).toEqual(['wangwu:pending']);
    await h.answer(LEAVE, id, 'wangwu');
    expect(await h.stage(LEAVE, id)).toBe('hr');
    // The request neither moved nor changed version while the run decided.
    expect(h.get(LEAVE, id)).toMatchObject({
      status: 'approving',
      lifecycleVersion: 2,
    });
    await h.answer(LEAVE, id, 'hr1');
    expect(await h.history(LEAVE, id)).toEqual([
      '$create',
      'submit',
      'approve',
      'registrationSucceeded',
    ]);
    expect(await h.runHistory(LEAVE, id)).toEqual([
      '$create',
      'manager.approve',
      'deptManager.approve',
      'hr.approve',
    ]);
  });

  it('the diagram draws the edges a plan can take: past a conditional stage, never past a fixed one', () => {
    const h = setup();
    const transitions = h.runtime.describe('approval:leave').transitions;
    expect(
      transitions
        .filter((transition) => transition.name.endsWith('.approve'))
        .map(
          (transition) => `${transition.from[0]}→${transition.to.join('|')}`,
        ),
    ).toEqual([
      'manager→deptManager|hr|approved',
      // The generator does not know both conditions are the same one.
      'deptManager→hr|approved',
      'hr→approved',
    ]);
  });

  it('decides from the submitted content: the plan is kept, and a direct edit is refused rather than re-routed', async () => {
    const h = setup();
    const id = await submitted(h, 2);
    h.store.patchRecord(SCENARIO_COLLECTIONS.leaveRequests, id, { days: 10 });
    expect((await refusal(h.answer(LEAVE, id, 'lisi'))).code).toBe(
      'CONTENT_CHANGED',
    );
    expect((await h.runs(LEAVE, id))[0].content).toEqual({
      days: 2,
      reason: 'Family matters',
    });
  });

  it('approves without anyone only through an explicit rule, and says which', async () => {
    const h = setup();
    const short = await h.create(
      'scenarioCompensatoryLeaves',
      { applicantId: 'zhangsan', days: 1 },
      'zhangsan',
    );
    await h.fire(
      'scenarioCompensatoryLeaves',
      short.id,
      'submit',
      {},
      'zhangsan',
    );
    expect(h.get('scenarioCompensatoryLeaves', short.id).status).toBe(
      'approved',
    );
    expect(await h.runs('scenarioCompensatoryLeaves', short.id)).toMatchObject([
      {
        status: 'approved',
        note: 'Rule CL-1: a day or less of compensatory leave needs no approval.',
      },
    ]);
    // Without such a rule, a request no stage applies to is refused.
    const lone = await h.create(
      LEAVE,
      {
        applicantId: 'zhangsan',
        days: 1,
        reason: 'x',
      },
      'zhangsan',
    );
    expect(h.get(LEAVE, lone.id).status).toBe('draft');
  });
});
