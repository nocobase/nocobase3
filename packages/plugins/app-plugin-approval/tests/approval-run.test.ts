// The contract between a business record and the approval run behind the
// state an approval provides: the run starts on entering the state, is cancelled on
// leaving it early, and fires one of the business's exits when it ends,
// with the changes its stages proposed — which the exit has to write.
import {
  defineLifecycle,
  type Lifecycle,
  type LifecycleRecord,
} from '@nocobase/lifecycle';
import { describe, expect, it } from 'vitest';

import { defineApproval, stagesFor, type Approval } from '../server/index.js';
import {
  createHarness,
  refusal,
  type TestServices,
} from './support/harness.js';

interface Memo extends LifecycleRecord {
  readonly applicantId: string;
  readonly text: string;
  readonly urgent: boolean;
  readonly status: string;
}

interface MemoTypes {
  record: Memo;
  state: 'draft' | 'approving' | 'approved' | 'rejected';
  services: TestServices;
}

const stage = stagesFor<MemoTypes>();

function memoApproval(name: string): Approval<MemoTypes> {
  return defineApproval<MemoTypes, 'edit' | 'sign'>({
    name,
    applicant: (record) => record.applicantId,
    directory: (services) => services.directory,
    freeze: ['text'],
    flow: ['edit', 'sign'],
    stages: {
      edit: stage.single({
        canRevise: ['text'],
        when: ({ record }) => !record.urgent,
        assignee: () => 'editor',
      }),
      sign: stage.single({
        when: ({ record }) => !record.urgent,
        assignee: () => 'signer',
      }),
    },
    exits: { approved: 'approve', rejected: 'reject' },
  });
}

function memoLifecycle(
  name: string,
  approval: Approval<MemoTypes>,
  settles: boolean,
): Lifecycle<MemoTypes> {
  return defineLifecycle({
    name,
    initial: 'draft',
    states: [
      'draft',
      approval.state('approving'),
      { name: 'approved', final: true },
      { name: 'rejected', final: true },
    ],
    transitions: {
      submit: { from: 'draft', to: 'approving' },
      withdraw: { from: 'approving', to: 'draft' },
      approve: {
        from: 'approving',
        to: 'approved',
        manual: false,
        ...(settles ? { set: approval.settle } : {}),
      },
      reject: { from: 'approving', to: 'rejected', manual: false },
    },
  });
}

const settling = memoApproval('memo');
const dropping = memoApproval('memoDropping');
const MEMOS = 'memos';
const DROPPING = 'memosDropping';

function setup() {
  return createHarness({
    people: ['writer', 'editor', 'signer'],
    lifecycles: [
      memoLifecycle(MEMOS, settling, true) as never,
      memoLifecycle(DROPPING, dropping, false) as never,
    ],
    approvals: [settling as never, dropping as never],
  });
}

async function submitted(
  h: ReturnType<typeof setup>,
  lifecycle: string,
  urgent = false,
): Promise<string> {
  const record = await h.create(
    lifecycle,
    { applicantId: 'writer', text: 'Draft', urgent },
    'writer',
  );
  await h.fire(lifecycle, record.id, 'submit', {}, 'writer');
  return String(record.id);
}

async function revised(
  h: ReturnType<typeof setup>,
  lifecycle: string,
  id: string,
): Promise<void> {
  const task = await h.taskOf(lifecycle, id, 'editor');
  await h.approvals.revise({
    taskId: task.id,
    actor: { id: 'editor' },
    values: { text: 'Edited' },
    reason: 'Clearer',
  });
}

describe('an approval run behind the state its approval provides', () => {
  it('starts on entering the state and holds the stages; the record only waits', async () => {
    const h = setup();
    const id = await submitted(h, MEMOS);
    expect(h.get(MEMOS, id).status).toBe('approving');
    const [run] = await h.runs(MEMOS, id);
    expect(run).toMatchObject({ status: 'edit', lifecycle: MEMOS });
    expect(h.get('approval:memo', run.id).status).toBe('edit');
    await h.answer(MEMOS, id, 'editor');
    expect(await h.stage(MEMOS, id)).toBe('sign');
    expect(h.get(MEMOS, id).lifecycleVersion).toBe(2);
  });

  it('is cancelled when the record leaves the state before it ends', async () => {
    const h = setup();
    const id = await submitted(h, MEMOS);
    await h.fire(MEMOS, id, 'withdraw', { reason: 'Not yet' }, 'writer');
    const [run] = await h.runs(MEMOS, id);
    expect(run).toMatchObject({
      status: 'cancelled',
      endedWith: 'withdraw',
      note: 'Not yet',
    });
    expect(await h.open(MEMOS, id)).toEqual([]);
    expect(await h.runHistory(MEMOS, id)).toEqual(['$create', 'cancel']);
  });

  it('a stage that applies to nothing refuses the submission without an explicit rule', async () => {
    const h = setup();
    const record = await h.create(
      MEMOS,
      { applicantId: 'writer', text: 'Now', urgent: true },
      'writer',
    );
    expect(
      (await refusal(h.fire(MEMOS, record.id, 'submit', {}, 'writer'))).code,
    ).toBe('NO_STAGE');
    expect(h.get(MEMOS, record.id).status).toBe('draft');
    expect(await h.runs(MEMOS, record.id)).toEqual([]);
  });

  it('an exit that drops the changes fails the run’s end rather than losing them', async () => {
    const h = setup();
    const id = await submitted(h, DROPPING);
    await revised(h, DROPPING, id);
    await h.answer(DROPPING, id, 'editor');
    const error = await refusal(h.answer(DROPPING, id, 'signer'));
    expect(error.message).toContain('"approve" did not write the changed text');
    // Nothing of the concluding answer stayed.
    expect(h.get(DROPPING, id)).toMatchObject({
      status: 'approving',
      text: 'Draft',
    });
    expect(await h.stage(DROPPING, id)).toBe('sign');
    expect(await h.open(DROPPING, id)).toEqual(['signer:pending']);
  });

  it('an exit that settles writes the changes with the end', async () => {
    const h = setup();
    const id = await submitted(h, MEMOS);
    await revised(h, MEMOS, id);
    await h.answer(MEMOS, id, 'editor');
    await h.answer(MEMOS, id, 'signer');
    expect(h.get(MEMOS, id)).toMatchObject({
      status: 'approved',
      text: 'Edited',
    });
  });

  it('refuses a stage named after one of a run’s ends', () => {
    expect(() =>
      defineApproval<MemoTypes, 'approved'>({
        name: 'broken',
        applicant: (record) => record.applicantId,
        directory: (services) => services.directory,
        flow: ['approved'],
        stages: { approved: stage.single({ assignee: () => 'signer' }) },
        exits: { approved: 'approve', rejected: 'reject' },
      }),
    ).toThrow('"approved" names how a run ends, not a stage.');
  });
});
