// The approval layer on a real database: the plugin's migration creates and
// drops its collections, and an approval runs on the Repository store with
// its runs, tasks and events in those collections, written in the
// transaction of the transition that caused them.
import path from 'node:path';

import { type DatabaseManager } from '@nocobase/db';
import {
  createTestDatabase,
  describeMigration,
} from '@nocobase/app-testing/server';
import {
  createRepositoryLifecycleStore,
  defineLifecycle,
  LIFECYCLE_COLLECTIONS,
  LifecycleRuntime,
  type LifecycleDefinition,
  type LifecycleRecord,
} from '@nocobase/lifecycle';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { rowsOf } from '../server/rows.js';

import packageMetadata from '../package.json' with { type: 'json' };
import {
  APPROVAL_COLLECTIONS,
  ApprovalService,
  defineApproval,
  stagesFor,
  type ApprovalDirectory,
  type TaskRow,
} from '../server/index.js';

const MEMOS = 'memos';

interface Memo extends LifecycleRecord {
  readonly applicantId: string;
  readonly text: string;
  readonly status: string;
  readonly lifecycleVersion: number;
}

interface MemoTypes {
  record: Memo;
  state: 'draft' | 'approving' | 'approved' | 'rejected';
  services: { readonly directory: ApprovalDirectory };
}

const directory: ApprovalDirectory = {
  isActive: () => true,
  managerOf: (person) => (person === 'editor' ? 'chief' : undefined),
  hasRole: () => false,
};

const stage = stagesFor<MemoTypes>();

const memoApproval = defineApproval<MemoTypes, 'edit' | 'sign'>({
  name: 'memo',
  applicant: (record) => record.applicantId,
  directory: (services) => services.directory,
  freeze: ['text'],
  flow: ['edit', 'sign'],
  stages: {
    edit: stage.single({
      canRevise: ['text'],
      escalateAfterHours: 24,
      assignee: () => 'editor',
    }),
    sign: stage.all({ assignees: () => ['signerA', 'signerB'] }),
  },
  exits: { approved: 'approve', rejected: 'reject' },
});

const memoDefinition: LifecycleDefinition<MemoTypes> = {
  name: MEMOS,
  initial: 'draft',
  states: [
    'draft',
    memoApproval.state('approving'),
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
      set: memoApproval.settle,
    },
    reject: { from: 'approving', to: 'rejected', manual: false },
  },
};

const memoLifecycle = defineLifecycle(memoDefinition);

let database: DatabaseManager;
let fixture: Awaited<ReturnType<typeof createTestDatabase>>;
const migrations = [
  {
    directory: path.resolve(import.meta.dirname, '../database/migrations'),
    packageName: packageMetadata.name,
  },
];
let now: Date;

beforeEach(async () => {
  fixture = await createTestDatabase({ migrations });
  database = fixture.database;
  now = new Date('2026-10-06T09:00:00.000Z');
});

afterEach(async () => {
  await fixture.destroy();
});

describeMigration('202610060001_approval_create_collections', {
  sources: migrations,
  up: async ({ expectCollection }) => {
    for (const name of Object.values(APPROVAL_COLLECTIONS))
      await expectCollection(name).toExist();
  },
  down: async ({ expectCollection }) => {
    for (const name of Object.values(APPROVAL_COLLECTIONS))
      await expectCollection(name).not.toExist();
  },
});

it('explains a missing host collection when a Repository resolves it lazily', async () => {
  await expect(
    rowsOf(database.connection()).get('missingApprovalHostRows', '1'),
  ).rejects.toThrow(
    'The approval host must migrate collection "missingApprovalHostRows"',
  );
});

describe('an approval on the Repository store', () => {
  let runtime: LifecycleRuntime;
  let approvals: ApprovalService;

  beforeEach(async () => {
    // The business's own tables, which its own migration would create.
    const builder = database.builder();
    await builder.createCollection(MEMOS, (table) => {
      table.bigInt('id').primary().autoIncrement().notNull();
      table.string('applicantId').notNull();
      table.text('text').notNull();
      table.string('status').notNull();
      table.datetimeTz('statusChangedAt').notNull();
      table.integer('lifecycleVersion').notNull().defaultTo(0);
    });
    await builder.createCollection(
      LIFECYCLE_COLLECTIONS.transitions,
      (table) => {
        table.bigInt('id').primary().autoIncrement().notNull();
        table.string('lifecycle').notNull();
        table.string('recordId').notNull();
        table.string('transition').notNull();
        table.string('from');
        table.string('to').notNull();
        table.string('actorId').notNull();
        table.json('input').notNull().defaultTo({});
        table.datetimeTz('at').notNull();
        table.integer('version').notNull();
        table.string('requestId');
        table.string('requestKey').notNull();
        table.unique(['lifecycle', 'recordId', 'requestKey']);
        table.unique(['lifecycle', 'recordId', 'version']);
      },
    );
    await builder.createCollection(
      LIFECYCLE_COLLECTIONS.effectRuns,
      (table) => {
        table.bigInt('id').primary().autoIncrement().notNull();
        table.bigInt('transitionId').notNull();
        table.string('lifecycle').notNull();
        table.string('recordId').notNull();
        table.string('effect').notNull();
        table.string('status').notNull();
        table.integer('attempts').notNull().defaultTo(0);
        table.integer('maxAttempts').notNull().defaultTo(1);
        table.json('result');
        table.text('error');
        table.datetimeTz('createdAt').notNull();
        table.datetimeTz('updatedAt').notNull();
        table.datetimeTz('claimedAt');
        table.datetimeTz('runAfter');
      },
    );
    runtime = new LifecycleRuntime({
      store: createRepositoryLifecycleStore(database),
      clock: () => now,
    });
    const services = { directory };
    runtime.register(memoLifecycle, { services });
    runtime.register(memoApproval.lifecycle as never, { services });
    approvals = new ApprovalService(runtime, [memoApproval as never], services);
  });

  async function memo(id: string): Promise<Memo> {
    const record = await database
      .repository(MEMOS)
      .findOne({ filter: { id: Number(id) } });
    if (!record) throw new Error(`No memo "${id}".`);
    return record as unknown as Memo;
  }

  async function submitted(): Promise<string> {
    const { record } = await runtime.create(
      MEMOS,
      { applicantId: 'writer', text: 'Draft' },
      { actor: { id: 'writer' } },
    );
    const id = String(record.id);
    await runtime.fire(MEMOS, id, 'submit', { actor: { id: 'writer' } });
    return id;
  }

  async function taskOf(id: string, person: string): Promise<TaskRow> {
    const task = (await approvals.tasksFor(MEMOS, id)).find(
      (each) => each.assigneeId === person && each.status === 'pending',
    );
    if (!task) throw new Error(`${person} has nothing to answer.`);
    return task;
  }

  it('keeps its runs, tasks and events in the plugin’s collections', async () => {
    const id = await submitted();
    const [run] = await approvals.runsFor(MEMOS, id);
    expect(run).toMatchObject({ status: 'edit', lifecycle: MEMOS });
    expect(run.startedAt).toBe(now.toISOString());
    const stored = await database
      .repository(APPROVAL_COLLECTIONS.tasks)
      .findMany({ filter: { runId: run.id } });
    expect(stored.map((task) => task.assigneeId)).toEqual(['editor']);
  });

  it('answers that leave a stage open leave the record alone, and the last one moves it', async () => {
    const id = await submitted();
    const waiting = await memo(id);
    await approvals.revise({
      taskId: (await taskOf(id, 'editor')).id,
      actor: { id: 'editor' },
      values: { text: 'Edited' },
      reason: 'Clearer',
    });
    await approvals.respond({
      taskId: (await taskOf(id, 'editor')).id,
      actor: { id: 'editor' },
      answer: 'approve',
    });
    await approvals.respond({
      taskId: (await taskOf(id, 'signerA')).id,
      actor: { id: 'signerA' },
      answer: 'approve',
    });
    // Two stages and a revision later, the record has not moved.
    expect(await memo(id)).toMatchObject({
      status: 'approving',
      lifecycleVersion: waiting.lifecycleVersion,
      text: 'Draft',
    });
    await approvals.respond({
      taskId: (await taskOf(id, 'signerB')).id,
      actor: { id: 'signerB' },
      answer: 'approve',
    });
    expect(await memo(id)).toMatchObject({
      status: 'approved',
      text: 'Edited',
    });
    const [run] = await approvals.runsFor(MEMOS, id);
    expect(run).toMatchObject({ status: 'approved', outcome: 'approved' });
    expect(run.changes).toMatchObject([
      { stage: 'edit', actorId: 'editor', values: { text: 'Edited' } },
    ]);
  });

  it('a withdrawal cancels the run and closes its tasks in the same transaction', async () => {
    const id = await submitted();
    await runtime.fire(MEMOS, id, 'withdraw', { actor: { id: 'writer' } });
    const [run] = await approvals.runsFor(MEMOS, id);
    expect(run).toMatchObject({ status: 'cancelled', endedWith: 'withdraw' });
    expect(
      (await approvals.tasksFor(MEMOS, id)).map((task) => task.status),
    ).toEqual(['voided']);
  });

  it('an answer on a task the withdrawal closed is refused and writes nothing', async () => {
    const id = await submitted();
    const task = await taskOf(id, 'editor');
    await runtime.fire(MEMOS, id, 'withdraw', { actor: { id: 'writer' } });
    await expect(
      approvals.respond({
        taskId: task.id,
        actor: { id: 'editor' },
        answer: 'approve',
      }),
    ).rejects.toMatchObject({ code: 'TASK_CLOSED' });
    expect(
      (await approvals.tasksFor(MEMOS, id)).map((each) => each.answer),
    ).toEqual([null]);
  });

  it('the sweep passes an idle task to the assignee’s manager, reading every task from the table', async () => {
    const id = await submitted();
    now = new Date(now.getTime() + 25 * 3_600_000);
    expect(await approvals.sweep()).toBe(1);
    expect(
      (await approvals.tasksFor(MEMOS, id)).map(
        (task) => `${task.assigneeId}:${task.status}`,
      ),
    ).toEqual(['editor:transferred', 'chief:pending']);
  });

  it('a submission the layer refuses leaves no run and no task behind', async () => {
    const { record } = await runtime.create(
      MEMOS,
      { applicantId: 'editor', text: 'Mine' },
      { actor: { id: 'editor' } },
    );
    const id = String(record.id);
    // The business's own hook on the state runs after the one the approval
    // provides, so it fails the submission once the run and its first task
    // were written.
    const failing = new LifecycleRuntime({
      store: createRepositoryLifecycleStore(database),
      clock: () => now,
    });
    const services = { directory };
    failing.register(
      defineLifecycle<MemoTypes>({
        ...memoDefinition,
        onEnterState: {
          approving: () => {
            throw new Error('Refused after the run was written.');
          },
        },
      }),
      { services },
    );
    failing.register(memoApproval.lifecycle as never, { services });
    await expect(
      failing.fire(MEMOS, id, 'submit', { actor: { id: 'editor' } }),
    ).rejects.toThrow('Refused after the run was written.');
    expect(await approvals.runsFor(MEMOS, id)).toEqual([]);
    expect(await approvals.tasksFor(MEMOS, id)).toEqual([]);
    expect((await memo(id)).status).toBe('draft');
  });
});
