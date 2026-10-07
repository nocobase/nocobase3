// A contract approval end to end: the shape the approval generates, its
// stages, returns, pool and countersignature, and the races between an
// answer and a withdrawal, against the run's stage states and the task rows
// of the approval layer.
import { toMermaid } from '@nocobase/lifecycle';
import { describe, expect, it } from 'vitest';

import {
  contractApproval,
  contractLifecycle,
} from '../../server/scenarios/contract.js';
import { createHarness, refusal, type Harness } from '../support/harness.js';

const C = 'scenarioContracts';

function setup(): Harness {
  return createHarness({
    org: {
      people: [
        'zhangsan',
        'lisi',
        'boss',
        'wangwu',
        'zhaoliu',
        'legal1',
        'fin1',
        'fin2',
        'buyer1',
        'buyer2',
        'buyer3',
        'ceo',
      ],
      managers: { zhangsan: 'lisi', lisi: 'boss', wangwu: 'boss' },
      roles: {
        legal: ['legal1'],
        finance: ['fin1', 'fin2'],
        procurement: ['buyer1', 'buyer2', 'buyer3'],
        ceo: ['ceo'],
      },
    },
    lifecycles: [contractLifecycle as never],
    approvals: [contractApproval as never],
  });
}

/** Where the contract is: the stage its run waits in while it is approving. */
const state = async (h: Harness, id: string): Promise<string> => {
  const status = String(h.get(C, id).status);
  return status === 'approving' ? String(await h.stage(C, id)) : status;
};

async function submitted(h: Harness, amount = 50_000): Promise<string> {
  const record = await h.create(
    C,
    { applicantId: 'zhangsan', title: 'Servers', amount },
    'zhangsan',
  );
  await h.fire(C, record.id, 'submit', {}, 'zhangsan');
  return String(record.id);
}

async function atPool(h: Harness, amount = 50_000): Promise<string> {
  const id = await submitted(h, amount);
  await h.answer(C, id, 'lisi');
  for (const person of ['legal1', 'fin1', 'fin2'])
    await h.answer(C, id, person);
  return id;
}

async function task(h: Harness, id: string, person: string) {
  return h.taskOf(C, id, person);
}

describe('contract · the shape of the definition', () => {
  it('four states for the contract, the stages for its run, and a diagram of the edges that can happen', () => {
    const h = setup();
    // The contract knows it is being approved, and how an approval ends.
    expect(contractLifecycle.states).toEqual([
      'draft',
      'approving',
      'approved',
      'rejected',
    ]);
    const edges = (name: string): string[] =>
      toMermaid(h.runtime.describe(name), { labels: 'name' })
        .split('\n')
        .filter((line) => line.includes('-->') && !line.includes('[*]'));
    // submit and withdraw, and the run's three ends.
    expect(edges(C)).toHaveLength(5);
    expect(
      h.runtime
        .describe(C)
        .transitions.filter((transition) => transition.manual)
        .map((transition) => transition.name),
    ).toEqual(['submit', 'withdraw']);
    // The stages are the run's, and only edges a run can take exist: the
    // approvals' 10 (any later
    // stage, since a return may come straight back), the rejections' 4, the
    // returns' 10 and the cancellations' 4 — every one a path a run can take.
    expect(contractApproval.lifecycle.states).toEqual([
      'managerApproval',
      'countersign',
      'procurement',
      'ceoApproval',
      'approved',
      'rejected',
      'returned',
      'cancelled',
    ]);
    expect(edges('approval:contract')).toHaveLength(28);
    expect(
      h.runtime
        .describe('approval:contract')
        .transitions.filter((transition) => transition.manual),
    ).toEqual([]);
  });
});

describe('contract · the full path', () => {
  it('manager → countersign → procurement → CEO above the threshold', async () => {
    const h = setup();
    const id = await submitted(h, 200_000);
    expect(await state(h, id)).toBe('managerApproval');
    expect(await h.open(C, id)).toEqual(['lisi:pending']);
    await h.answer(C, id, 'lisi');
    expect(await h.open(C, id)).toEqual([
      'legal1:pending',
      'fin1:pending',
      'fin2:pending',
    ]);
    await h.answer(C, id, 'legal1');
    await h.answer(C, id, 'fin1');
    expect(await state(h, id)).toBe('countersign');
    await h.answer(C, id, 'fin2');
    expect(await state(h, id)).toBe('procurement');
    await h.answer(C, id, 'buyer2');
    expect(await state(h, id)).toBe('ceoApproval');
    await h.answer(C, id, 'ceo');
    expect(await state(h, id)).toBe('approved');
    expect(
      (await h.tasks(C, id))
        .filter((each) => each.answer !== null)
        .map((each) => `${each.stage}:${each.assigneeId}`),
    ).toEqual([
      'managerApproval:lisi',
      'countersign:legal1',
      'countersign:fin1',
      'countersign:fin2',
      'procurement:buyer2',
      'ceoApproval:ceo',
    ]);
    expect(h.messagesTo('zhangsan')).toEqual([`Contract ${id}: approved`]);
  });

  it('below the threshold the procurement decision approves', async () => {
    const h = setup();
    const id = await atPool(h);
    await h.answer(C, id, 'buyer1');
    expect(await state(h, id)).toBe('approved');
  });

  it('each countersigner is told once, and a vote moves nothing but its task', async () => {
    const h = setup();
    const id = await submitted(h);
    await h.answer(C, id, 'lisi');
    const entered = h.get(C, id);
    h.advance({ hours: 5 });
    await h.answer(C, id, 'legal1');
    await h.answer(C, id, 'fin1');
    expect(h.get(C, id)).toBe(entered);
    for (const person of ['legal1', 'fin1', 'fin2'])
      expect(h.messagesTo(person)).toEqual([
        `Contract ${id} awaits you (countersign)`,
      ]);
  });
});

describe('contract · countersign', () => {
  it('the first rejection rejects; a reason is required', async () => {
    const h = setup();
    const id = await submitted(h);
    await h.answer(C, id, 'lisi');
    expect((await refusal(h.answer(C, id, 'fin1', 'reject', ''))).code).toBe(
      'REASON_REQUIRED',
    );
    await h.answer(C, id, 'fin1', 'reject', 'Over budget.');
    expect(await state(h, id)).toBe('rejected');
  });

  it('a countersigner adds one more alongside, whose approval is then required', async () => {
    const h = setup();
    const id = await submitted(h);
    await h.answer(C, id, 'lisi');
    await h.approvals.addSigner({
      taskId: (await task(h, id, 'legal1')).id,
      actor: { id: 'legal1' },
      person: 'zhaoliu',
      mode: 'alongside',
    });
    for (const person of ['legal1', 'fin1', 'fin2'])
      await h.answer(C, id, person);
    expect(await state(h, id)).toBe('countersign');
    expect(await h.actions(C, id, 'zhaoliu')).toContain('zhaoliu:respond');
    await h.answer(C, id, 'zhaoliu');
    expect(await state(h, id)).toBe('procurement');
  });

  it('a person who voted cannot vote again', async () => {
    const h = setup();
    const id = await submitted(h);
    await h.answer(C, id, 'lisi');
    await h.answer(C, id, 'fin1');
    expect((await refusal(h.answer(C, id, 'fin1'))).code).toBe(
      'ALREADY_ANSWERED',
    );
  });
});

describe('contract · procurement: the first answer, or a claim', () => {
  it('anyone in the pool answers; on the same page only one answer stands', async () => {
    const h = setup();
    const id = await atPool(h);
    const buyer2 = await task(h, id, 'buyer2');
    await h.answer(C, id, 'buyer1');
    expect(
      (
        await refusal(
          h.approvals.respond({
            taskId: buyer2.id,
            actor: { id: 'buyer2' },
            answer: 'reject',
            comment: 'No',
          }),
        )
      ).code,
    ).toBe('TASK_CLOSED');
    expect(await state(h, id)).toBe('approved');
  });

  it('a claim takes it from the others until it is released', async () => {
    const h = setup();
    const id = await atPool(h);
    expect(await h.actions(C, id, 'buyer2')).toEqual(
      expect.arrayContaining(['buyer2:claim', 'buyer2:respond']),
    );
    const version = h.get(C, id).lifecycleVersion;
    await h.approvals.claim({
      taskId: (await task(h, id, 'buyer1')).id,
      actor: { id: 'buyer1' },
    });
    expect(await h.open(C, id)).toEqual([
      'buyer1:claimed',
      'buyer2:suspended',
      'buyer3:suspended',
    ]);
    expect(await h.actions(C, id, 'buyer2')).toEqual([]);
    expect((await refusal(h.answer(C, id, 'buyer2'))).code).toBe(
      'NOT_YOUR_TURN',
    );
    await h.approvals.release({
      taskId: (await task(h, id, 'buyer1')).id,
      actor: { id: 'buyer1' },
    });
    expect(await h.open(C, id)).toEqual([
      'buyer1:pending',
      'buyer2:pending',
      'buyer3:pending',
    ]);
    // Taking and putting back are the second layer's: the contract never moved.
    expect(h.get(C, id).lifecycleVersion).toBe(version);
    await h.answer(C, id, 'buyer2');
    expect(await state(h, id)).toBe('approved');
  });

  it('two claims at once: one holds it', async () => {
    const h = setup();
    const id = await atPool(h);
    const [first, second] = [
      await task(h, id, 'buyer1'),
      await task(h, id, 'buyer2'),
    ];
    await h.approvals.claim({ taskId: first.id, actor: { id: 'buyer1' } });
    expect(
      (
        await refusal(
          h.approvals.claim({ taskId: second.id, actor: { id: 'buyer2' } }),
        )
      ).code,
    ).toBe('NOT_YOUR_TURN');
  });

  it('a claim against an answer from the pool: whichever commits first stands', async () => {
    const h = setup();
    const id = await atPool(h);
    const buyer2 = await task(h, id, 'buyer2');
    await h.approvals.claim({
      taskId: (await task(h, id, 'buyer1')).id,
      actor: { id: 'buyer1' },
    });
    expect(
      (
        await refusal(
          h.approvals.respond({
            taskId: buyer2.id,
            actor: { id: 'buyer2' },
            answer: 'approve',
          }),
        )
      ).code,
    ).toBe('NOT_YOUR_TURN');
  });

  it('a claim nobody acts on goes back to the pool after 24 hours', async () => {
    const h = setup();
    const id = await atPool(h);
    await h.approvals.claim({
      taskId: (await task(h, id, 'buyer1')).id,
      actor: { id: 'buyer1' },
    });
    h.advance({ hours: 23 });
    expect(await h.approvals.sweep()).toBe(0);
    h.advance({ hours: 2 });
    expect(await h.approvals.sweep()).toBe(1);
    expect(await h.open(C, id)).toEqual([
      'buyer1:pending',
      'buyer2:pending',
      'buyer3:pending',
    ]);
  });
});

describe('contract · added signers', () => {
  it('before: the invited signer decides first, then it comes back; an invited signer cannot invite', async () => {
    const h = setup();
    const id = await submitted(h);
    await h.approvals.addSigner({
      taskId: (await task(h, id, 'lisi')).id,
      actor: { id: 'lisi' },
      person: 'zhaoliu',
      mode: 'before',
    });
    expect(await h.open(C, id)).toEqual(['lisi:blocked', 'zhaoliu:pending']);
    expect(await h.actions(C, id, 'lisi')).toEqual([]);
    expect(await h.actions(C, id, 'zhaoliu')).toEqual([
      'zhaoliu:respond',
      'zhaoliu:returnTo',
      'zhaoliu:transfer',
    ]);
    await h.answer(C, id, 'zhaoliu');
    expect(await state(h, id)).toBe('managerApproval');
    expect(await h.open(C, id)).toEqual(['lisi:pending']);
    await h.answer(C, id, 'lisi');
    expect(await state(h, id)).toBe('countersign');
  });

  it('before, after a transfer: it comes back to whom it was transferred to', async () => {
    const h = setup();
    const id = await submitted(h);
    await h.approvals.transfer({
      taskId: (await task(h, id, 'lisi')).id,
      actor: { id: 'lisi' },
      to: 'wangwu',
      reason: 'Away',
    });
    await h.approvals.addSigner({
      taskId: (await task(h, id, 'wangwu')).id,
      actor: { id: 'wangwu' },
      person: 'zhaoliu',
      mode: 'before',
    });
    await h.answer(C, id, 'zhaoliu');
    expect(await h.open(C, id)).toEqual(['wangwu:pending']);
  });

  it('after: the owner approves, then the invited signer decides', async () => {
    const h = setup();
    const id = await submitted(h);
    await h.approvals.addSigner({
      taskId: (await task(h, id, 'lisi')).id,
      actor: { id: 'lisi' },
      person: 'zhaoliu',
      mode: 'after',
    });
    expect(await h.actions(C, id, 'zhaoliu')).toEqual([]);
    await h.answer(C, id, 'lisi');
    expect(await state(h, id)).toBe('managerApproval');
    await h.answer(C, id, 'zhaoliu');
    expect(await state(h, id)).toBe('countersign');
  });

  it('an invited signer who rejects rejects the request', async () => {
    const h = setup();
    const id = await submitted(h);
    await h.approvals.addSigner({
      taskId: (await task(h, id, 'lisi')).id,
      actor: { id: 'lisi' },
      person: 'zhaoliu',
      mode: 'before',
    });
    await h.answer(C, id, 'zhaoliu', 'reject', 'Wrong vendor.');
    expect(await state(h, id)).toBe('rejected');
  });

  it('the applicant and someone already responsible cannot be invited', async () => {
    const h = setup();
    const id = await submitted(h);
    const lisi = await task(h, id, 'lisi');
    for (const [person, code] of [
      ['zhangsan', 'APPLICANT_NOT_ELIGIBLE'],
      ['lisi', 'ALREADY_RESPONSIBLE'],
    ] as const)
      expect(
        (
          await refusal(
            h.approvals.addSigner({
              taskId: lisi.id,
              actor: { id: 'lisi' },
              person,
              mode: 'before',
            }),
          )
        ).code,
      ).toBe(code);
  });

  it('several signers on one stage: a list of tasks, not a state per signer', async () => {
    const h = setup();
    const id = await submitted(h);
    const lisi = await task(h, id, 'lisi');
    for (const person of ['zhaoliu', 'wangwu'])
      await h.approvals.addSigner({
        taskId: lisi.id,
        actor: { id: 'lisi' },
        person,
        mode: 'after',
      });
    await h.answer(C, id, 'lisi');
    expect(await h.open(C, id)).toEqual(['zhaoliu:pending', 'wangwu:pending']);
    await h.answer(C, id, 'zhaoliu');
    expect(await state(h, id)).toBe('managerApproval');
    await h.answer(C, id, 'wangwu');
    expect(await state(h, id)).toBe('countersign');
  });
});

describe('contract · transfer and escalation', () => {
  it('a transfer moves the responsibility, not the record, and tells the new approver', async () => {
    const h = setup();
    const id = await submitted(h);
    const before = h.get(C, id);
    await h.approvals.transfer({
      taskId: (await task(h, id, 'lisi')).id,
      actor: { id: 'lisi' },
      to: 'wangwu',
      reason: 'On leave',
    });
    expect(h.get(C, id)).toBe(before);
    expect(await h.open(C, id)).toEqual(['wangwu:pending']);
    expect(h.messagesTo('wangwu')).toEqual([
      `Contract ${id} awaits you (managerApproval)`,
    ]);
    expect(await h.actions(C, id, 'lisi')).toEqual([]);
  });

  it('an idle manager stage is escalated after 48 hours', async () => {
    const h = setup();
    const id = await submitted(h);
    h.advance({ hours: 49 });
    expect(await h.approvals.sweep()).toBe(1);
    expect(await h.open(C, id)).toEqual(['boss:pending']);
    expect(h.messagesTo('boss')).toEqual([
      `Contract ${id} awaits you (managerApproval)`,
    ]);
  });

  it('a transfer keeps the stage’s deadline: neither the record’s clock nor the task’s restarts', async () => {
    const h = setup();
    const id = await submitted(h);
    const entered = h.get(C, id).statusChangedAt;
    h.advance({ hours: 40 });
    await h.approvals.transfer({
      taskId: (await task(h, id, 'lisi')).id,
      actor: { id: 'lisi' },
      to: 'wangwu',
      reason: 'Away',
    });
    expect(h.get(C, id).statusChangedAt).toBe(entered);
    h.advance({ hours: 10 });
    expect(await h.approvals.sweep()).toBe(1);
    expect(await h.open(C, id)).toEqual(['boss:pending']);
  });
});

describe('contract · returns', () => {
  it('to an earlier stage: everything from there is decided again', async () => {
    const h = setup();
    const id = await atPool(h);
    await h.approvals.returnTo({
      taskId: (await task(h, id, 'buyer1')).id,
      actor: { id: 'buyer1' },
      to: 'managerApproval',
      reason: 'Missing quote.',
    });
    expect(await state(h, id)).toBe('managerApproval');
    expect(await h.open(C, id)).toEqual(['lisi:pending']);
    await h.answer(C, id, 'lisi');
    expect(await state(h, id)).toBe('countersign');
    expect(await h.open(C, id)).toEqual([
      'legal1:pending',
      'fin1:pending',
      'fin2:pending',
    ]);
  });

  it('to an earlier stage, coming straight back: the stages between are skipped', async () => {
    const h = setup();
    const id = await atPool(h);
    await h.approvals.returnTo({
      taskId: (await task(h, id, 'buyer1')).id,
      actor: { id: 'buyer1' },
      to: 'managerApproval',
      reason: 'Missing quote.',
      resume: true,
    });
    expect((await h.runs(C, id))[0].resumeAt).toBe('procurement');
    await h.answer(C, id, 'lisi');
    expect(await state(h, id)).toBe('procurement');
    expect((await h.runs(C, id))[0].resumeAt).toBeNull();
  });

  it('coming straight back passes through the returned stage’s added signer first', async () => {
    const h = setup();
    const id = await atPool(h);
    await h.approvals.returnTo({
      taskId: (await task(h, id, 'buyer1')).id,
      actor: { id: 'buyer1' },
      to: 'managerApproval',
      reason: 'Missing quote.',
      resume: true,
    });
    await h.approvals.addSigner({
      taskId: (await task(h, id, 'lisi')).id,
      actor: { id: 'lisi' },
      person: 'zhaoliu',
      mode: 'after',
    });
    await h.answer(C, id, 'lisi');
    expect(await state(h, id)).toBe('managerApproval');
    await h.answer(C, id, 'zhaoliu');
    expect(await state(h, id)).toBe('procurement');
  });

  it('to the applicant, coming straight back: the resubmission skips to the returner', async () => {
    const h = setup();
    const id = await atPool(h, 200_000);
    await h.answer(C, id, 'buyer1');
    await h.approvals.returnTo({
      taskId: (await task(h, id, 'ceo')).id,
      actor: { id: 'ceo' },
      to: 'applicant',
      reason: 'Attach the signed NDA.',
      resume: true,
    });
    expect(await state(h, id)).toBe('draft');
    expect(h.messagesTo('zhangsan')).toContain(`Contract ${id}: draft`);
    await h.fire(C, id, 'submit', {}, 'zhangsan');
    expect(await state(h, id)).toBe('ceoApproval');
    expect(await h.open(C, id)).toEqual(['ceo:pending']);
    expect((await h.runs(C, id)).map((run) => run.status)).toEqual([
      'returned',
      'ceoApproval',
    ]);
    expect(await h.history(C, id)).toEqual([
      '$create',
      'submit',
      'return',
      'submit',
    ]);
    // The second run passes the manager straight on to the returner.
    expect(await h.runHistory(C, id)).toEqual([
      '$create',
      'managerApproval.approve',
    ]);
  });

  it('only to an earlier stage: the current one or a later one is refused', async () => {
    const h = setup();
    const id = await submitted(h);
    await h.answer(C, id, 'lisi');
    const fin1 = await task(h, id, 'fin1');
    for (const to of ['countersign', 'procurement', 'nowhere'])
      expect(
        (
          await refusal(
            h.approvals.returnTo({
              taskId: fin1.id,
              actor: { id: 'fin1' },
              to,
              reason: 'x',
            }),
          )
        ).code,
      ).toBe('INVALID_TARGET');
  });

  it('a countersigner who has voted can no longer return it', async () => {
    const h = setup();
    const id = await submitted(h);
    await h.answer(C, id, 'lisi');
    const fin1 = await task(h, id, 'fin1');
    await h.answer(C, id, 'fin1');
    expect(
      (
        await refusal(
          h.approvals.returnTo({
            taskId: fin1.id,
            actor: { id: 'fin1' },
            to: 'managerApproval',
            reason: 'x',
          }),
        )
      ).code,
    ).toBe('ALREADY_ANSWERED');
  });

  it('a claimed request is returned by its claimer only, and nobody holds a claim afterwards', async () => {
    const h = setup();
    const id = await atPool(h);
    await h.approvals.claim({
      taskId: (await task(h, id, 'buyer1')).id,
      actor: { id: 'buyer1' },
    });
    expect(await h.actions(C, id, 'buyer1')).toEqual([
      'buyer1:release',
      'buyer1:respond',
      'buyer1:returnTo',
      'buyer1:transfer',
      'buyer1:addSigner',
    ]);
    expect(await h.actions(C, id, 'buyer2')).toEqual([]);
    await h.approvals.returnTo({
      taskId: (await task(h, id, 'buyer1')).id,
      actor: { id: 'buyer1' },
      to: 'countersign',
      reason: 'Finance missed the tax.',
    });
    expect(await state(h, id)).toBe('countersign');
    expect(
      (await h.tasks(C, id))
        .filter((each) => each.stage === 'procurement')
        .map((each) => each.status),
    ).toEqual(['completed', 'voided', 'voided']);
  });
});

describe('contract · withdraw', () => {
  it('the applicant withdraws from any stage and starts over with a new run', async () => {
    const h = setup();
    const id = await atPool(h);
    await h.approvals.claim({
      taskId: (await task(h, id, 'buyer1')).id,
      actor: { id: 'buyer1' },
    });
    await h.fire(C, id, 'withdraw', {}, 'zhangsan');
    expect(await state(h, id)).toBe('draft');
    expect(await h.open(C, id)).toEqual([]);
    await h.fire(C, id, 'submit', {}, 'zhangsan');
    expect(await state(h, id)).toBe('managerApproval');
    expect(
      (await h.runs(C, id)).map((run) => [run.status, run.endedWith]),
    ).toEqual([
      ['cancelled', 'withdraw'],
      ['managerApproval', null],
    ]);
  });

  it('the last vote and a withdrawal: the one that reaches the record first decides', async () => {
    const h = setup();
    const id = await submitted(h);
    await h.answer(C, id, 'lisi');
    for (const person of ['legal1', 'fin1']) await h.answer(C, id, person);
    const last = await task(h, id, 'fin2');
    await h.fire(C, id, 'withdraw', {}, 'zhangsan');
    expect(
      (
        await refusal(
          h.approvals.respond({
            taskId: last.id,
            actor: { id: 'fin2' },
            answer: 'approve',
          }),
        )
      ).code,
    ).toBe('TASK_CLOSED');
    expect(await state(h, id)).toBe('draft');
    // The answers given before the withdrawal stay as history.
    expect(
      (await h.tasks(C, id))
        .filter((each) => each.stage === 'countersign')
        .map((each) => `${each.assigneeId}:${each.status}`),
    ).toEqual(['legal1:completed', 'fin1:completed', 'fin2:voided']);
  });
});
