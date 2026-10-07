// Scenarios 22 (submitting for someone else), 24 (a candidate pool), 26
// (opinions and material) and the exclusivity part of 28.
import { describe, expect, it } from 'vitest';

import { ORG } from '../support/services.js';
import {
  counselApproval,
  counselLifecycle,
  matterApproval,
  matterLifecycle,
  poolApproval,
  poolLifecycle,
  tripApproval,
  tripLifecycle,
} from '../../server/scenarios/participation.js';
import { createHarness, refusal, type Harness } from '../support/harness.js';

const TRIP = 'scenarioTrips';
const POOL = 'scenarioPoolRequests';
const COUNSEL = 'scenarioCounselReviews';
const MATTER = 'scenarioMatters';

function setup(): Harness {
  return createHarness({
    org: ORG,
    lifecycles: [
      tripLifecycle as never,
      poolLifecycle as never,
      counselLifecycle as never,
      matterLifecycle as never,
    ],
    approvals: [
      tripApproval as never,
      poolApproval as never,
      counselApproval as never,
      matterApproval as never,
    ],
  });
}

async function trip(
  h: Harness,
  applicantId: string,
  createdBy: string,
): Promise<string> {
  const record = await h.create(
    TRIP,
    { applicantId, createdBy, submittedBy: null, city: 'Shenzhen' },
    createdBy,
  );
  return String(record.id);
}

async function submitted(
  h: Harness,
  lifecycle: string,
  values: Record<string, unknown> = {},
) {
  const record = await h.create(
    lifecycle,
    { applicantId: 'zhang', ...values },
    'zhang',
  );
  await h.fire(lifecycle, record.id, 'submit', {}, 'zhang');
  return String(record.id);
}

describe('scenario 22 · submitting for someone else', () => {
  it('an assistant drafts and submits for zhang; zhang’s manager decides; both hear the outcome', async () => {
    const h = setup();
    const id = await trip(h, 'zhang', 'assistant');
    await h.fire(TRIP, id, 'submit', {}, 'assistant');
    expect(h.get(TRIP, id)).toMatchObject({
      applicantId: 'zhang',
      createdBy: 'assistant',
      submittedBy: 'assistant',
    });
    expect(await h.open(TRIP, id)).toEqual(['li:pending']);
    await h.answer(TRIP, id, 'li');
    expect(h.messagesTo('zhang')).toEqual([
      'Trip to Shenzhen for zhang: approved',
    ]);
    expect(h.messagesTo('assistant')).toEqual([
      'Trip to Shenzhen for zhang: approved',
    ]);
  });

  it('someone with no proxy right cannot submit for zhang', async () => {
    const h = setup();
    const id = await trip(h, 'zhang', 'zhao');
    await expect(h.fire(TRIP, id, 'submit', {}, 'zhao')).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'notApplicant' })],
    });
  });

  it('self-approval is judged against the beneficiary: li’s trip goes to wang', async () => {
    const h = setup();
    const id = await trip(h, 'li', 'li');
    await h.fire(TRIP, id, 'submit', {}, 'li');
    expect(await h.open(TRIP, id)).toEqual(['wang:pending']);
  });

  it('the proxy who submitted can withdraw, and the run says who ended it', async () => {
    const h = setup();
    const id = await trip(h, 'zhang', 'assistant');
    await h.fire(TRIP, id, 'submit', {}, 'assistant');
    await h.fire(TRIP, id, 'withdraw', {}, 'assistant');
    expect(h.get(TRIP, id).status).toBe('draft');
    expect((await h.runs(TRIP, id))[0]).toMatchObject({
      status: 'cancelled',
      endedBy: 'assistant',
    });
  });
});

describe('scenario 24 · a candidate pool', () => {
  it('whoever takes it decides; the others cannot, and the request never moved meanwhile', async () => {
    const h = setup();
    const id = await submitted(h, POOL);
    const before = h.get(POOL, id);
    expect(await h.open(POOL, id)).toEqual([
      'finA:candidate',
      'finB:candidate',
      'finC:candidate',
    ]);
    expect((await refusal(h.answer(POOL, id, 'finA'))).code).toBe(
      'CLAIM_FIRST',
    );
    const tasks = await h.tasks(POOL, id);
    await h.approvals.claim({ taskId: tasks[0].id, actor: { id: 'finA' } });
    expect(
      (
        await refusal(
          h.approvals.claim({ taskId: tasks[1].id, actor: { id: 'finB' } }),
        )
      ).code,
    ).toBe('NOT_YOUR_TURN');
    expect((await refusal(h.answer(POOL, id, 'finB'))).code).toBe(
      'NOT_YOUR_TURN',
    );
    expect(h.get(POOL, id)).toBe(before);
    await h.answer(POOL, id, 'finA');
    expect(h.get(POOL, id).status).toBe('approved');
  });

  it('put back, assigned by the supervisor, and returned to the pool when left idle', async () => {
    const h = setup();
    const id = await submitted(h, POOL);
    const tasks = await h.tasks(POOL, id);
    await h.approvals.claim({ taskId: tasks[0].id, actor: { id: 'finA' } });
    await h.approvals.release({ taskId: tasks[0].id, actor: { id: 'finA' } });
    await h.approvals.assign({
      taskId: tasks[0].id,
      to: 'finC',
      actor: { id: 'sup' },
    });
    expect(await h.open(POOL, id)).toEqual([
      'finA:suspended',
      'finB:suspended',
      'finC:claimed',
    ]);
    h.advance({ hours: 25 });
    expect(await h.approvals.sweep()).toBe(1);
    expect(await h.open(POOL, id)).toEqual([
      'finA:candidate',
      'finB:candidate',
      'finC:candidate',
    ]);
    expect(
      (await h.events(POOL, id))
        .filter((event) => event.kind === 'task.released')
        .at(-1),
    ).toMatchObject({ actorId: 'system' });
  });

  it('only the supervisor assigns, and only to an active pool member', async () => {
    const h = setup();
    const id = await submitted(h, POOL);
    const [first] = await h.tasks(POOL, id);
    expect(
      (
        await refusal(
          h.approvals.assign({
            taskId: first.id,
            to: 'finB',
            actor: { id: 'finA' },
          }),
        )
      ).code,
    ).toBe('NOT_ALLOWED');
    h.org.deactivate('finB');
    expect(
      (
        await refusal(
          h.approvals.assign({
            taskId: first.id,
            to: 'finB',
            actor: { id: 'sup' },
          }),
        )
      ).code,
    ).toBe('NOT_IN_POOL');
  });
});

describe('scenario 26 · opinions and material inside a stage', () => {
  it('asks counsel; the decision waits for the opinion, and counsel cannot decide', async () => {
    const h = setup();
    const id = await submitted(h, COUNSEL, { title: 'Supply contract' });
    const reviewer = await h.taskOf(COUNSEL, id, 'li');
    const asked = await h.approvals.consult({
      taskId: reviewer.id,
      actor: { id: 'li' },
      person: 'lawyer',
      question: 'Is clause 7 enforceable?',
    });
    expect(asked).toMatchObject({
      kind: 'consult',
      role: 'gate',
      gates: reviewer.id,
    });
    expect((await refusal(h.answer(COUNSEL, id, 'li'))).code).toBe(
      'NOT_YOUR_TURN',
    );
    expect(
      (
        await refusal(
          h.approvals.respond({
            taskId: asked.id,
            actor: { id: 'lawyer' },
            answer: 'approve',
          }),
        )
      ).code,
    ).toBe('INVALID_ANSWER');
    await h.approvals.respond({
      taskId: asked.id,
      actor: { id: 'lawyer' },
      answer: 'opinion',
      comment: 'Yes, with changes',
    });
    await h.answer(COUNSEL, id, 'li');
    expect(h.get(COUNSEL, id).status).toBe('approved');
    expect(
      (await h.tasks(COUNSEL, id)).map(
        (task) => `${task.kind}:${task.assigneeId}:${task.answer}`,
      ),
    ).toEqual(['decide:li:approve', 'consult:lawyer:opinion']);
  });

  it('asks the applicant for an attachment without returning the request', async () => {
    const h = setup();
    const id = await submitted(h, COUNSEL, { title: 'Supply contract' });
    const before = h.get(COUNSEL, id);
    const reviewer = await h.taskOf(COUNSEL, id, 'li');
    const asked = await h.approvals.askMaterial({
      taskId: reviewer.id,
      actor: { id: 'li' },
      request: 'Attach the signed NDA',
    });
    expect(asked).toMatchObject({ kind: 'material', assigneeId: 'zhang' });
    // Material adds to the request; it does not change it.
    expect(
      (
        await refusal(
          h.approvals.respond({
            taskId: asked.id,
            actor: { id: 'zhang' },
            answer: 'provided',
            data: { title: 'Another contract' },
          }),
        )
      ).code,
    ).toBe('INVALID_ANSWER');
    await h.approvals.respond({
      taskId: asked.id,
      actor: { id: 'zhang' },
      answer: 'provided',
      comment: 'Here',
      data: { attachments: ['nda.pdf'] },
    });
    // The same stay, the same content, and li's turn again.
    expect(h.get(COUNSEL, id)).toBe(before);
    expect(await h.open(COUNSEL, id)).toEqual(['li:pending']);
    expect((await h.tasks(COUNSEL, id))[1]).toMatchObject({
      status: 'completed',
      data: { attachments: ['nda.pdf'] },
      note: 'Attach the signed NDA',
    });
  });

  it('the deadline is the task’s own: asking an opinion does not restart it', async () => {
    const h = setup();
    const id = await submitted(h, COUNSEL, { title: 'Supply contract' });
    h.advance({ hours: 70 });
    const reviewer = await h.taskOf(COUNSEL, id, 'li');
    await h.approvals.consult({
      taskId: reviewer.id,
      actor: { id: 'li' },
      person: 'lawyer',
      question: '?',
    });
    h.advance({ hours: 5 });
    // li is blocked waiting for the opinion: blocked work is not idle work.
    expect(await h.approvals.sweep()).toBe(0);
    await h.approvals.respond({
      taskId: (await h.taskOf(COUNSEL, id, 'lawyer')).id,
      actor: { id: 'lawyer' },
      answer: 'opinion',
      comment: 'Fine',
    });
    expect(await h.approvals.sweep()).toBe(1);
    expect(await h.open(COUNSEL, id)).toEqual(['wang:pending']);
  });
});

describe('scenario 28 · one open request per subject and matter', () => {
  it('refuses a duplicate on the same matter while one is under review', async () => {
    const h = setup();
    const draft = (subjectKey: string) =>
      h.create(MATTER, { applicantId: 'zhang', subjectKey }, 'zhang');
    const first = await draft('contract:42:priceException');
    await h.fire(MATTER, first.id, 'submit', {}, 'zhang');
    const second = await draft('contract:42:priceException');
    await expect(
      h.fire(MATTER, second.id, 'submit', {}, 'zhang'),
    ).rejects.toMatchObject({
      blockers: [expect.objectContaining({ code: 'subjectBusy' })],
    });
    const other = await draft('contract:42:paymentTerms');
    await h.fire(MATTER, other.id, 'submit', {}, 'zhang');
    expect(await h.stage(MATTER, other.id)).toBe('manager');
    await h.answer(MATTER, String(first.id), 'li');
    await h.fire(MATTER, second.id, 'submit', {}, 'zhang');
    expect(await h.stage(MATTER, second.id)).toBe('manager');
  });
});
