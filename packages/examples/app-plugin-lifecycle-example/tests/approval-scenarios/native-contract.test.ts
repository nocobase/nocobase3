// A contract approval written as one plain lifecycle, without the generic
// staged approval: multi-person stages, returns to any earlier stage, added
// signers and a claimable pool, all as states and transitions.
import {
  LifecycleError,
  toMermaid,
  type JsonObject,
  type LifecycleActor,
} from '@nocobase/lifecycle';
import { describe, expect, it } from 'vitest';

import {
  contractDraft,
  contractNativeLifecycle,
  type ContractApproval,
} from '../../server/approval-scenarios/contract-native.js';
import { createHarness, type Harness } from './harness.js';

const C = 'contractApprovals';

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
    lifecycles: [contractNativeLifecycle],
  });
}

function contract(h: Harness, id: string): ContractApproval {
  return h.get(C, id) as ContractApproval;
}

async function fire(
  h: Harness,
  id: string,
  transition: string,
  actor: string | LifecycleActor,
  input: JsonObject = {},
  version?: number,
): Promise<ContractApproval> {
  return (await h.fire(
    C,
    id,
    transition,
    input,
    actor,
    version === undefined ? {} : { expect: { version } },
  )) as ContractApproval;
}

async function submitted(h: Harness, amount = 50_000): Promise<string> {
  const record = await h.create(
    C,
    contractDraft({ applicantId: 'zhangsan', title: 'Servers', amount }),
    'zhangsan',
  );
  const id = String(record.id);
  await fire(h, id, 'submit', 'zhangsan');
  return id;
}

/** Walks a fresh request up to the procurement pool. */
async function atPool(h: Harness, amount = 50_000): Promise<string> {
  const id = await submitted(h, amount);
  await fire(h, id, 'approve', 'lisi');
  for (const person of ['legal1', 'fin1', 'fin2'])
    await fire(h, id, 'countersign', person, { decision: 'approve' });
  return id;
}

async function refusal(promise: Promise<unknown>): Promise<LifecycleError> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(LifecycleError);
  return error as LifecycleError;
}

const versionOf = (record: ContractApproval): number =>
  record.lifecycleVersion as number;

describe('native contract approval · the shape of the definition', () => {
  it('twelve states and thirteen transitions draw a diagram of 126 edges', () => {
    const description = contractNativeLifecycle;
    expect(description.states).toHaveLength(12);
    expect([...description.transitions.keys()]).toEqual([
      'submit',
      'approve',
      'reject',
      'countersign',
      'addCountersigner',
      'claim',
      'release',
      'procure',
      'transfer',
      'escalate',
      'addSigner',
      'returnTo',
      'withdraw',
    ]);
    const h = setup();
    const edges = toMermaid(h.runtime.describe(C), { labels: 'name' })
      .split('\n')
      .filter((line) => line.includes('-->') && !line.includes('[*]'));
    // `from × to` of every transition: the diagram shows what may be
    // declared, not what can happen — `approve` alone declares 6 × 7 pairs,
    // of which 12 are reachable, because its route picks from the record.
    expect(edges).toHaveLength(126);
  });
});

describe('native contract approval · the full path', () => {
  it('manager → countersign → procurement → CEO above the threshold', async () => {
    const h = setup();
    const id = await submitted(h, 200_000);
    expect(contract(h, id)).toMatchObject({
      status: 'managerReview',
      approverId: 'lisi',
    });
    await fire(h, id, 'approve', 'lisi');
    expect(contract(h, id)).toMatchObject({
      status: 'countersign',
      countersigners: ['legal1', 'fin1', 'fin2'],
    });
    await fire(h, id, 'countersign', 'legal1', { decision: 'approve' });
    await fire(h, id, 'countersign', 'fin1', { decision: 'approve' });
    expect(contract(h, id).status).toBe('countersign');
    await fire(h, id, 'countersign', 'fin2', { decision: 'approve' });
    expect(contract(h, id)).toMatchObject({
      status: 'procurementPool',
      pool: ['buyer1', 'buyer2', 'buyer3'],
    });
    await fire(h, id, 'procure', 'buyer2', { decision: 'approve' });
    expect(contract(h, id)).toMatchObject({
      status: 'ceoReview',
      approverId: 'ceo',
    });
    const done = await fire(h, id, 'approve', 'ceo');
    expect(done.status).toBe('approved');
    expect(done.votes.map((vote) => `${vote.state}:${vote.userId}`)).toEqual([
      'managerReview:lisi',
      'countersign:legal1',
      'countersign:fin1',
      'countersign:fin2',
      'procurementPool:buyer2',
      'ceoReview:ceo',
    ]);
    expect(h.messagesTo('zhangsan')).toEqual([`Contract ${id}: approved`]);
  });

  it('below the threshold the procurement decision approves', async () => {
    const h = setup();
    const id = await atPool(h, 50_000);
    expect(
      (await fire(h, id, 'procure', 'buyer1', { decision: 'approve' })).status,
    ).toBe('approved');
  });

  it('each countersigner is told once, although every vote re-runs onEnter', async () => {
    const h = setup();
    const id = await submitted(h);
    await fire(h, id, 'approve', 'lisi');
    await fire(h, id, 'countersign', 'legal1', { decision: 'approve' });
    await fire(h, id, 'countersign', 'fin1', { decision: 'approve' });
    for (const person of ['legal1', 'fin1', 'fin2'])
      expect(h.messagesTo(person)).toEqual([
        `Contract ${id} awaits you (countersign)`,
      ]);
  });
});

describe('native contract approval · countersign', () => {
  it('the first rejection rejects; a reason is required', async () => {
    const h = setup();
    const id = await submitted(h);
    await fire(h, id, 'approve', 'lisi');
    expect(
      (
        await refusal(
          fire(h, id, 'countersign', 'fin1', { decision: 'reject' }),
        )
      ).code,
    ).toBe('INVALID_INPUT');
    const rejected = await fire(h, id, 'countersign', 'fin1', {
      decision: 'reject',
      comment: 'Over budget.',
    });
    expect(rejected.status).toBe('rejected');
  });

  it('a countersigner adds one more alongside, whose approval is then required', async () => {
    const h = setup();
    const id = await submitted(h);
    await fire(h, id, 'approve', 'lisi');
    await fire(h, id, 'addCountersigner', 'legal1', { userId: 'zhaoliu' });
    for (const person of ['legal1', 'fin1', 'fin2'])
      await fire(h, id, 'countersign', person, { decision: 'approve' });
    expect(contract(h, id).status).toBe('countersign');
    expect(await h.allowed(C, id, 'zhaoliu')).toContain('countersign');
    await fire(h, id, 'countersign', 'zhaoliu', { decision: 'approve' });
    expect(contract(h, id).status).toBe('procurementPool');
  });

  it('a person who voted cannot vote again', async () => {
    const h = setup();
    const id = await submitted(h);
    await fire(h, id, 'approve', 'lisi');
    await fire(h, id, 'countersign', 'fin1', { decision: 'approve' });
    expect(
      (
        await refusal(
          fire(h, id, 'countersign', 'fin1', { decision: 'approve' }),
        )
      ).blockers[0]?.code,
    ).toBe('notResponsible');
  });
});

describe('native contract approval · procurement: the first answer, or a claim', () => {
  it('anyone in the pool answers; on the same page only one answer stands', async () => {
    const h = setup();
    const id = await atPool(h);
    const seen = versionOf(contract(h, id));
    await fire(h, id, 'procure', 'buyer1', { decision: 'approve' }, seen);
    await expect(
      fire(
        h,
        id,
        'procure',
        'buyer2',
        { decision: 'reject', comment: 'No' },
        seen,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(contract(h, id).status).toBe('approved');
  });

  it('a claim takes it from the others until it is released', async () => {
    const h = setup();
    const id = await atPool(h);
    expect(await h.allowed(C, id, 'buyer2')).toEqual(
      expect.arrayContaining(['claim', 'procure']),
    );
    const claimed = await fire(h, id, 'claim', 'buyer1');
    expect(claimed).toMatchObject({
      status: 'procurementClaimed',
      claimedBy: 'buyer1',
    });
    expect(await h.allowed(C, id, 'buyer2')).toEqual([]);
    expect(
      (await refusal(fire(h, id, 'procure', 'buyer2', { decision: 'approve' })))
        .blockers[0]?.code,
    ).toBe('notResponsible');

    await fire(h, id, 'release', 'buyer1');
    expect(contract(h, id)).toMatchObject({
      status: 'procurementPool',
      claimedBy: null,
      pool: ['buyer1', 'buyer2', 'buyer3'],
    });
    await fire(h, id, 'procure', 'buyer2', { decision: 'approve' });
    expect(contract(h, id).status).toBe('approved');
  });

  it('two claims on the same page: one holds it', async () => {
    const h = setup();
    const id = await atPool(h);
    const seen = versionOf(contract(h, id));
    await fire(h, id, 'claim', 'buyer1', {}, seen);
    await expect(
      fire(h, id, 'claim', 'buyer2', {}, seen),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(contract(h, id).claimedBy).toBe('buyer1');
  });

  it('a claim against an answer from the pool: whichever commits first stands', async () => {
    const h = setup();
    const id = await atPool(h);
    const seen = versionOf(contract(h, id));
    await fire(h, id, 'claim', 'buyer1', {}, seen);
    await expect(
      fire(h, id, 'procure', 'buyer2', { decision: 'approve' }, seen),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('a claim nobody acts on goes back to the pool after 24 hours', async () => {
    const h = setup();
    const id = await atPool(h);
    await fire(h, id, 'claim', 'buyer1');
    h.advance({ hours: 23 });
    expect(await h.runtime.runTriggers()).toBe(0);
    h.advance({ hours: 2 });
    expect(await h.runtime.runTriggers()).toBe(1);
    expect(contract(h, id)).toMatchObject({
      status: 'procurementPool',
      claimedBy: null,
    });
  });
});

describe('native contract approval · added signers', () => {
  it('before: the invited signer decides first, then the stage comes back', async () => {
    const h = setup();
    const id = await submitted(h);
    await fire(h, id, 'addSigner', 'lisi', {
      userId: 'zhaoliu',
      mode: 'before',
    });
    expect(contract(h, id)).toMatchObject({
      status: 'managerPreSign',
      approverId: 'lisi',
      addedSigner: { userId: 'zhaoliu', mode: 'before', by: 'lisi' },
    });
    expect(await h.allowed(C, id, 'lisi')).toEqual([]);
    // An invited signer cannot invite another: the state has no addSigner.
    expect(await h.allowed(C, id, 'zhaoliu')).toEqual([
      'approve',
      'reject',
      'returnTo',
    ]);
    await fire(h, id, 'approve', 'zhaoliu');
    expect(contract(h, id)).toMatchObject({
      status: 'managerReview',
      approverId: 'lisi',
      addedSigner: null,
    });
    await fire(h, id, 'approve', 'lisi');
    expect(contract(h, id).status).toBe('countersign');
  });

  it('before, after a transfer: the stage comes back to whom it was transferred to', async () => {
    const h = setup();
    const id = await submitted(h);
    await fire(h, id, 'transfer', 'lisi', { userId: 'wangwu', reason: 'Away' });
    await fire(h, id, 'addSigner', 'wangwu', {
      userId: 'zhaoliu',
      mode: 'before',
    });
    await fire(h, id, 'approve', 'zhaoliu');
    expect(contract(h, id)).toMatchObject({
      status: 'managerReview',
      approverId: 'wangwu',
    });
  });

  it('after: the owner approves, then the invited signer decides', async () => {
    const h = setup();
    const id = await submitted(h);
    await fire(h, id, 'addSigner', 'lisi', {
      userId: 'zhaoliu',
      mode: 'after',
    });
    expect(contract(h, id).status).toBe('managerReview');
    expect(await h.allowed(C, id, 'zhaoliu')).toEqual([]);
    await fire(h, id, 'approve', 'lisi');
    expect(contract(h, id).status).toBe('managerPostSign');
    await fire(h, id, 'approve', 'zhaoliu');
    expect(contract(h, id).status).toBe('countersign');
  });

  it('an invited signer who rejects rejects the request', async () => {
    const h = setup();
    const id = await submitted(h);
    await fire(h, id, 'addSigner', 'lisi', {
      userId: 'zhaoliu',
      mode: 'before',
    });
    const rejected = await fire(h, id, 'reject', 'zhaoliu', {
      comment: 'Wrong vendor.',
    });
    expect(rejected.status).toBe('rejected');
  });

  it('the applicant and the current approver cannot be invited', async () => {
    const h = setup();
    const id = await submitted(h);
    for (const [userId, code] of [
      ['zhangsan', 'applicantNotEligible'],
      ['lisi', 'alreadyResponsible'],
    ] as const)
      expect(
        (
          await refusal(
            fire(h, id, 'addSigner', 'lisi', { userId, mode: 'before' }),
          )
        ).blockers[0]?.code,
      ).toBe(code);
  });

  it('limitation: one added signer per stage — a second would need a list, which is a plan', async () => {
    const h = setup();
    const id = await submitted(h);
    await fire(h, id, 'addSigner', 'lisi', {
      userId: 'zhaoliu',
      mode: 'after',
    });
    expect(
      (
        await refusal(
          fire(h, id, 'addSigner', 'lisi', { userId: 'wangwu', mode: 'after' }),
        )
      ).blockers[0]?.code,
    ).toBe('signerAlreadyAdded');
  });
});

describe('native contract approval · transfer and escalation', () => {
  it('a transfer moves the responsibility, not the state, and tells the new approver', async () => {
    const h = setup();
    const id = await submitted(h);
    const moved = await fire(h, id, 'transfer', 'lisi', {
      userId: 'wangwu',
      reason: 'On leave',
    });
    expect(moved).toMatchObject({
      status: 'managerReview',
      approverId: 'wangwu',
    });
    expect(h.messagesTo('wangwu')).toEqual([
      `Contract ${id} awaits you (managerReview)`,
    ]);
    expect(await h.allowed(C, id, 'lisi')).toEqual([]);
  });

  it('an idle manager stage is escalated after 48 hours', async () => {
    const h = setup();
    const id = await submitted(h);
    h.advance({ hours: 49 });
    expect(await h.runtime.runTriggers()).toBe(1);
    expect(contract(h, id).approverId).toBe('boss');
    expect(h.messagesTo('boss')).toEqual([
      `Contract ${id} awaits you (managerReview)`,
    ]);
  });

  it('limitation: a transfer restarts the escalation clock, because every transition does', async () => {
    const h = setup();
    const id = await submitted(h);
    h.advance({ hours: 40 });
    await fire(h, id, 'transfer', 'lisi', { userId: 'wangwu', reason: 'Away' });
    h.advance({ hours: 10 });
    // 50 hours since the stage began, 10 since the transfer.
    expect(await h.runtime.runTriggers()).toBe(0);
  });

  it('limitation: a vote on a countersign restarts the stage clock too', async () => {
    const h = setup();
    const id = await submitted(h);
    await fire(h, id, 'approve', 'lisi');
    const entered = contract(h, id).statusChangedAt;
    h.advance({ hours: 5 });
    await fire(h, id, 'countersign', 'fin1', { decision: 'approve' });
    expect(contract(h, id).statusChangedAt).not.toBe(entered);
  });
});

describe('native contract approval · returns', () => {
  it('to an earlier stage: everything from there is decided again', async () => {
    const h = setup();
    const id = await atPool(h);
    await fire(h, id, 'returnTo', 'buyer1', {
      target: 'manager',
      reason: 'Missing quote.',
    });
    expect(contract(h, id)).toMatchObject({
      status: 'managerReview',
      approverId: 'lisi',
      resumeAt: null,
    });
    await fire(h, id, 'approve', 'lisi');
    expect(contract(h, id)).toMatchObject({
      status: 'countersign',
      countersignVotes: [],
    });
  });

  it('to an earlier stage, coming straight back: the stages between are skipped', async () => {
    const h = setup();
    const id = await atPool(h);
    await fire(h, id, 'returnTo', 'buyer1', {
      target: 'manager',
      reason: 'Missing quote.',
      resumeToMe: true,
    });
    expect(contract(h, id).resumeAt).toBe('procurement');
    await fire(h, id, 'approve', 'lisi');
    expect(contract(h, id)).toMatchObject({
      status: 'procurementPool',
      resumeAt: null,
    });
  });

  it('coming straight back passes through the returned stage’s added signer first', async () => {
    const h = setup();
    const id = await atPool(h);
    await fire(h, id, 'returnTo', 'buyer1', {
      target: 'manager',
      reason: 'Missing quote.',
      resumeToMe: true,
    });
    await fire(h, id, 'addSigner', 'lisi', {
      userId: 'zhaoliu',
      mode: 'after',
    });
    await fire(h, id, 'approve', 'lisi');
    expect(contract(h, id).status).toBe('managerPostSign');
    await fire(h, id, 'approve', 'zhaoliu');
    expect(contract(h, id).status).toBe('procurementPool');
  });

  it('to the applicant, coming straight back: the resubmission skips to the returner', async () => {
    const h = setup();
    const id = await atPool(h, 200_000);
    await fire(h, id, 'procure', 'buyer1', { decision: 'approve' });
    await fire(h, id, 'returnTo', 'ceo', {
      target: 'applicant',
      reason: 'Attach the signed NDA.',
      resumeToMe: true,
    });
    expect(contract(h, id)).toMatchObject({
      status: 'draft',
      resumeAt: 'ceo',
    });
    expect(h.messagesTo('zhangsan')).toContain(`Contract ${id}: draft`);
    const resubmitted = await fire(h, id, 'submit', 'zhangsan');
    expect(resubmitted).toMatchObject({
      status: 'ceoReview',
      approverId: 'ceo',
      round: 2,
      resumeAt: null,
    });
  });

  it('only to an earlier stage: the current one or a later one is refused', async () => {
    const h = setup();
    const id = await submitted(h);
    await fire(h, id, 'approve', 'lisi');
    for (const target of ['countersign', 'procurement', 'nowhere'])
      expect(
        (
          await refusal(
            fire(h, id, 'returnTo', 'fin1', { target, reason: 'x' }),
          )
        ).blockers[0]?.code,
      ).toBe('badTarget');
  });

  it('a countersigner who has voted can no longer return it', async () => {
    const h = setup();
    const id = await submitted(h);
    await fire(h, id, 'approve', 'lisi');
    await fire(h, id, 'countersign', 'fin1', { decision: 'approve' });
    expect(
      (
        await refusal(
          fire(h, id, 'returnTo', 'fin1', { target: 'manager', reason: 'x' }),
        )
      ).blockers[0]?.code,
    ).toBe('notResponsible');
  });

  it('a claimed request is returned by its claimer only', async () => {
    const h = setup();
    const id = await atPool(h);
    await fire(h, id, 'claim', 'buyer1');
    expect(await h.allowed(C, id, 'buyer1')).toEqual([
      'release',
      'procure',
      'returnTo',
    ]);
    await fire(h, id, 'returnTo', 'buyer1', {
      target: 'countersign',
      reason: 'Finance missed the tax.',
    });
    expect(contract(h, id)).toMatchObject({
      status: 'countersign',
      claimedBy: null,
    });
  });
});

describe('native contract approval · withdraw', () => {
  it('the applicant withdraws from any reviewing state and starts over', async () => {
    const h = setup();
    const id = await atPool(h);
    await fire(h, id, 'claim', 'buyer1');
    const back = await fire(h, id, 'withdraw', 'zhangsan');
    expect(back).toMatchObject({ status: 'draft', claimedBy: null });
    const again = await fire(h, id, 'submit', 'zhangsan');
    expect(again).toMatchObject({ status: 'managerReview', round: 2 });
  });
});
