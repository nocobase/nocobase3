// How the staged approval keeps its data: a row per stage of each round, a
// row per to-do, and a log row per step of handling a stage, each tied to
// the lifecycle transition it was part of.
import { describe, expect, it } from 'vitest';

import {
  active,
  approvalHarness,
  decide,
  logs,
  submitted,
  tasks,
  trail,
} from './approval-fixtures.js';

describe('the staged approval’s records', () => {
  it('keeps the request row free of stages and to-dos', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'contractCountersign', {
      reviewers: ['legalA', 'legalB'],
    });
    for (const field of ['stages', 'cursor', 'consultations', 'materials'])
      expect(r).not.toHaveProperty(field);
    expect(r.currentStageId).toBe((await active(h, r.id))?.id);
  });

  it('gives every person their own to-do, and closes the others once the stage is decided', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'financeFirst', {});
    expect(
      (await tasks(h, r.id)).map((task) => [task.assigneeId, task.status]),
    ).toEqual([
      ['finA', 'pending'],
      ['finB', 'pending'],
      ['finC', 'pending'],
    ]);
    await decide(h, r.id, 'finB', 'approve', 'Fine');
    expect(
      (await tasks(h, r.id)).map((task) => [
        task.assigneeId,
        task.status,
        task.decision,
        task.actorId,
      ]),
    ).toEqual([
      ['finA', 'voided', null, null],
      ['finB', 'completed', 'approve', 'finB'],
      ['finC', 'voided', null, null],
    ]);
  });

  it('hands a to-do over as a new row that names the one it replaces', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'legalReview', {});
    await h.fire(
      'approvalRequests',
      r.id,
      'transfer',
      { to: 'lawyer', reason: 'Needs a specialist' },
      'legalA',
    );
    const [original, handedOver] = await tasks(h, r.id);
    expect(original).toMatchObject({
      assigneeId: 'legalA',
      status: 'transferred',
      closeReason: 'Handed over by legalA: Needs a specialist.',
    });
    expect(handedOver).toMatchObject({
      assigneeId: 'lawyer',
      status: 'pending',
      via: 'transfer',
      previousTaskId: original.id,
      stageId: original.stageId,
    });
  });

  it('keeps a question to an expert and material asked of the applicant as to-dos of their own', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'consulted', {});
    await h.fire(
      'approvalRequests',
      r.id,
      'consult',
      { expertId: 'lawyer', question: 'Is clause 7 enforceable?' },
      'legalA',
    );
    await h.fire(
      'approvalRequests',
      r.id,
      'requestMaterials',
      { request: 'The signed annex' },
      'legalA',
    );
    expect(
      (await tasks(h, r.id)).map((task) => [
        task.kind,
        task.assigneeId,
        task.status,
        task.prompt,
      ]),
    ).toEqual([
      // The decision waits while the applicant is asked for material.
      ['decide', 'legalA', 'suspended', null],
      ['consult', 'lawyer', 'pending', 'Is clause 7 enforceable?'],
      ['supply', 'zhang', 'pending', 'The signed annex'],
    ]);
  });

  it('logs each stage’s handling under the transition it was part of', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'leaveTiered', { days: 5 });
    await decide(h, r.id, 'li');
    const history = (await h.runtime.history('approvalRequests', r.id))
      .transitions;
    const steps = await logs(h, r.id);
    // Every step belongs to a transition the lifecycle logged.
    const ids = new Set(history.map((entry) => entry.id));
    expect(steps.every((step) => ids.has(step.transitionId ?? ''))).toBe(true);
    const of = (transition: string): string[] => {
      const entry = history.find((each) => each.transition === transition);
      return steps
        .filter((step) => step.transitionId === entry?.id)
        .map((step) => `${step.kind}${step.userId ? `:${step.userId}` : ''}`);
    };
    expect(of('submit')).toEqual([
      'submitted',
      'stage.planned',
      'stage.planned',
      'stage.planned',
      'task.assigned:li',
      'stage.activated',
    ]);
    expect(of('decide')).toEqual([
      'task.decided:li',
      'stage.approved',
      'task.assigned:wang',
      'stage.activated',
    ]);
  });

  it('reads back as one timeline: the transitions, and inside each what it did to the stages', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'contract', {
      party: 'ACME',
      amount: 100_000,
      terms: 'net 30',
    });
    await decide(h, r.id, 'li');
    await decide(h, r.id, 'legalA');
    await h.fire(
      'approvalRequests',
      r.id,
      'returnTo',
      { target: 'legal', reason: 'Clause 7 is unclear' },
      'finA',
    );
    const { stages, logs: steps } = await trail(h, r.id);
    const stageKey = new Map(stages.map((stage) => [stage.id, stage.key]));
    const timeline = (
      await h.runtime.history('approvalRequests', r.id)
    ).transitions.map((entry) => [
      `${entry.actorId} ${entry.transition}`,
      steps
        .filter(
          (step) =>
            step.transitionId === entry.id &&
            !['submitted', 'stage.planned'].includes(step.kind),
        )
        .map(
          (step) =>
            `${step.kind} ${stageKey.get(step.stageId ?? '') ?? ''}${step.userId ? ` ${step.userId}` : ''}`,
        ),
    ]);
    expect(timeline).toEqual([
      ['zhang $create', []],
      ['zhang submit', ['task.assigned manager li', 'stage.activated manager']],
      [
        'li decide',
        [
          'task.decided manager li',
          'stage.approved manager',
          'task.assigned legal legalA',
          'stage.activated legal',
        ],
      ],
      [
        'legalA decide',
        [
          'task.decided legal legalA',
          'stage.approved legal',
          'task.assigned finance finA',
          'stage.activated finance',
        ],
      ],
      [
        'finA returnTo',
        [
          'task.voided legal legalA',
          'stage.reset legal',
          'task.voided finance finA',
          'stage.reset finance',
          'task.assigned legal legalA',
          'stage.activated legal',
        ],
      ],
    ]);
    // The reset says why, and the decision it voided keeps what was decided.
    expect(steps.find((step) => step.kind === 'stage.reset')?.message).toBe(
      'Returned by finA: Clause 7 is unclear',
    );
    const legal = stages.find((stage) => stage.key === 'legal');
    expect(
      legal?.tasks.map((task) => [task.assigneeId, task.status, task.decision]),
    ).toEqual([
      ['legalA', 'voided', 'approve'],
      ['legalA', 'pending', null],
    ]);
  });

  it('writes nothing when its rows cannot be written, and plans the next transition afresh', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'leaveTiered', { days: 5 });
    const { records } = h.services;
    const insert = records.insert;
    records.insert = () => Promise.reject(new Error('The disk is full.'));
    await expect(decide(h, r.id, 'li')).rejects.toThrow('The disk is full.');
    records.insert = insert;
    expect(h.get('approvalRequests', r.id)).toMatchObject({
      status: 'inReview',
      sequence: r.sequence,
    });
    // The rolled-back decision's plan is not the withdrawal's.
    await h.fire('approvalRequests', r.id, 'withdraw', {}, 'zhang');
    expect(
      (await tasks(h, r.id)).map((task) => [
        task.assigneeId,
        task.status,
        task.decision,
        task.closeReason,
      ]),
    ).toEqual([['li', 'voided', null, 'Withdrawn by zhang.']]);
  });

  it('numbers the rows of a request once, so a refused transition takes no number', async () => {
    const h = approvalHarness();
    const r = await submitted(h, 'financeFirst', {});
    const before = r.sequence;
    await expect(decide(h, r.id, 'li')).rejects.toMatchObject({
      code: 'GUARD_REJECTED',
    });
    expect(h.get('approvalRequests', r.id).sequence).toBe(before);
    expect(
      (await logs(h, r.id)).map((step) => step.seq).at(-1),
    ).toBeLessThanOrEqual(before);
  });
});
