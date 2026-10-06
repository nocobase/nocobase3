// The stage policies on their own: each is a pure function from the tasks
// of a stay to the stage's result, so each rule is a table of answers.
import { describe, expect, it } from 'vitest';

import {
  allPolicy,
  anyPolicy,
  claimablePolicy,
  firstPolicy,
  itemizedPolicy,
  sequentialPolicy,
  thresholdPolicy,
  type PolicyTask,
  type StageEvent,
} from '../server/index.js';

const ANSWERED: StageEvent = { kind: 'answered', taskId: 'a' };

/** Tasks for `answers` in order: null is not answered yet, `-` is waiting. */
function tasks(...answers: (string | null)[]): PolicyTask[] {
  let seq = 0;
  return answers.map((answer, order) => ({
    id: String.fromCharCode(97 + order),
    assigneeId: `p${order}`,
    status:
      answer === '-' ? 'waiting' : answer === null ? 'pending' : 'completed',
    answer: answer === '-' ? null : answer,
    order,
    seq: answer === null || answer === '-' ? null : (seq += 1),
    subject: null,
    data: null,
  }));
}

describe('planning', () => {
  it('gives everyone a pending task, a sequence its first, and a pool candidates', () => {
    const people = ['x', 'y'];
    expect(
      allPolicy.plan({ people, options: { onReject: 'immediate' } }),
    ).toEqual([
      { assigneeId: 'x', status: 'pending', order: 0 },
      { assigneeId: 'y', status: 'pending', order: 1 },
    ]);
    expect(
      sequentialPolicy.plan({ people, options: {} }).map((task) => task.status),
    ).toEqual(['pending', 'waiting']);
    expect(
      claimablePolicy
        .plan({ people, options: { mustClaim: true } })
        .map((task) => task.status),
    ).toEqual(['candidate', 'candidate']);
  });
});

describe('deciding', () => {
  const decide = (
    policy: typeof allPolicy | typeof anyPolicy,
    options: never,
    answers: (string | null)[],
  ) =>
    policy.decide({
      tasks: tasks(...answers),
      options,
      event: ANSWERED,
      settings: {},
    });

  it('all: waits for everyone; a rejection ends it at once or once everyone answered', () => {
    const immediate = { onReject: 'immediate' } as never;
    const collect = { onReject: 'collect' } as never;
    expect(decide(allPolicy, immediate, ['approve', null]).kind).toBe('open');
    expect(decide(allPolicy, immediate, ['approve', 'approve'])).toEqual({
      kind: 'closed',
      result: 'approved',
    });
    expect(decide(allPolicy, immediate, ['reject', null])).toEqual({
      kind: 'closed',
      result: 'rejected',
    });
    expect(decide(allPolicy, collect, ['reject', null]).kind).toBe('open');
    expect(decide(allPolicy, collect, ['reject', 'approve'])).toEqual({
      kind: 'closed',
      result: 'rejected',
    });
  });

  it('any: one approval approves; rejected only once nobody is left', () => {
    expect(decide(anyPolicy, {} as never, ['reject', null]).kind).toBe('open');
    expect(decide(anyPolicy, {} as never, ['reject', 'approve'])).toEqual({
      kind: 'closed',
      result: 'approved',
    });
    expect(decide(anyPolicy, {} as never, ['reject', 'reject'])).toEqual({
      kind: 'closed',
      result: 'rejected',
    });
  });

  it('first: the earliest answer decides either way', () => {
    expect(
      firstPolicy.decide({
        tasks: tasks('reject', null),
        options: {},
        event: ANSWERED,
        settings: {},
      }),
    ).toEqual({ kind: 'closed', result: 'rejected' });
  });

  it('threshold: approved at the minimum, rejected once out of reach or by a vetoer', () => {
    const decideVote = (answers: (string | null)[], vetoers: string[] = []) =>
      thresholdPolicy.decide({
        tasks: tasks(...answers),
        options: { min: 3, vetoers, abstain: true },
        event: ANSWERED,
        settings: {},
      });
    expect(thresholdPolicy.answers?.({ min: 3, abstain: true })).toEqual([
      'abstain',
    ]);
    expect(decideVote(['approve', 'approve', null, null, null]).kind).toBe(
      'open',
    );
    expect(
      decideVote(['approve', 'approve', 'abstain', 'approve', null]),
    ).toEqual({ kind: 'closed', result: 'approved' });
    expect(decideVote(['reject', 'reject', 'abstain', null, null])).toEqual({
      kind: 'closed',
      result: 'rejected',
    });
    expect(decideVote(['approve', null, null, null, 'reject'], ['p4'])).toEqual(
      { kind: 'closed', result: 'rejected' },
    );
  });

  it('sequential: gives the next person their turn and rejects at the first no', () => {
    const decideTurn = (answers: (string | null)[]) =>
      sequentialPolicy.decide({
        tasks: tasks(...answers),
        options: {},
        event: ANSWERED,
        settings: {},
      });
    expect(decideTurn(['approve', '-'])).toEqual({
      kind: 'open',
      activate: ['b'],
    });
    expect(decideTurn(['approve', 'approve'])).toEqual({
      kind: 'closed',
      result: 'approved',
    });
    expect(decideTurn(['reject', '-'])).toEqual({
      kind: 'closed',
      result: 'rejected',
    });
  });

  it('claimable: taking a task suspends the others, releasing puts them back', () => {
    const pool = tasks(null, null, null).map((task) => ({
      ...task,
      status: 'candidate' as const,
    }));
    expect(
      claimablePolicy.decide({
        tasks: pool,
        options: { mustClaim: true },
        event: { kind: 'claimed', taskId: 'a' },
        settings: {},
      }),
    ).toEqual({ kind: 'open', suspend: ['b', 'c'] });
    const taken = pool.map((task) => ({
      ...task,
      status: task.id === 'a' ? ('claimed' as const) : ('suspended' as const),
    }));
    expect(
      claimablePolicy.decide({
        tasks: taken,
        options: { mustClaim: true },
        event: { kind: 'released', taskId: 'a' },
        settings: {},
      }),
    ).toEqual({ kind: 'open', candidates: ['a', 'b', 'c'] });
  });
});

describe('itemized lines', () => {
  const line = (
    subject: string,
    answer: string | null,
    approvedCents?: number,
  ): PolicyTask => ({
    id: subject,
    assigneeId: 'fin',
    status: answer === null ? 'pending' : 'completed',
    answer,
    order: 0,
    seq: answer === null ? null : 1,
    subject,
    data: {
      amountCents: 1000,
      ...(approvedCents === undefined ? {} : { approvedCents }),
    },
  });
  const options = { partialSetting: 'partialAllowed' };

  it('ends with each line’s decision and the approved total', () => {
    expect(
      itemizedPolicy.decide({
        tasks: [line('flight', 'approve', 600), line('hotel', 'reject')],
        options,
        event: ANSWERED,
        settings: { partialAllowed: true },
      }),
    ).toEqual({
      kind: 'closed',
      result: { exit: 'partiallyApproved' },
      data: {
        decisions: {
          flight: { outcome: 'approve', approvedCents: 600, hash: null },
          hotel: { outcome: 'reject', approvedCents: 0, hash: null },
        },
        approvedTotalCents: 600,
      },
    });
  });

  it('rejects at once without partial approval, and returns a returned line', () => {
    expect(
      itemizedPolicy.decide({
        tasks: [line('flight', 'reject'), line('hotel', null)],
        options,
        event: ANSWERED,
        settings: { partialAllowed: false },
      }),
    ).toMatchObject({ kind: 'closed', result: 'rejected' });
    expect(
      itemizedPolicy.decide({
        tasks: [line('flight', 'approve'), line('hotel', 'return')],
        options,
        event: ANSWERED,
        settings: {},
      }),
    ).toMatchObject({ kind: 'closed', result: { returnTo: 'applicant' } });
  });

  it('refuses an amount above the line and a refusal without a reason', () => {
    const task = line('flight', null);
    expect(
      itemizedPolicy.check?.({
        task,
        answer: 'approve',
        comment: null,
        data: { approvedCents: 2000 },
        options,
      }),
    ).toContain('cannot be approved');
    expect(
      itemizedPolicy.check?.({
        task,
        answer: 'reject',
        comment: null,
        data: {},
        options,
      }),
    ).toBe('Say why.');
  });
});
