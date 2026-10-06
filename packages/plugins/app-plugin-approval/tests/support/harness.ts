// A runtime on a memory store with a fake clock, a fixed directory of
// people, and the approval layer's service over the approvals under test.
// Each approval's run lifecycle is registered beside the business
// lifecycles, the way an application registers them.
import {
  LifecycleRuntime,
  MemoryLifecycleStore,
  type JsonObject,
  type Lifecycle,
  type LifecycleActor,
  type LifecycleRecord,
  type LifecycleTypes,
  type RecordId,
} from '@nocobase/lifecycle';
import { expect } from 'vitest';

import {
  ApprovalError,
  ApprovalService,
  OPEN,
  type Answered,
  type Approval,
  type ApprovalDirectory,
  type RunRow,
  type TaskRow,
} from '../../server/index.js';

/** What the businesses under test are registered with. */
export interface TestServices {
  readonly directory: ApprovalDirectory;
}

export interface HarnessOptions {
  readonly people: readonly string[];
  readonly managers?: Readonly<Record<string, string>>;
  readonly roles?: Readonly<Record<string, readonly string[]>>;
  readonly lifecycles: readonly Lifecycle<LifecycleTypes>[];
  readonly approvals: readonly Approval<never>[];
}

function actorOf(actor: string | LifecycleActor | undefined): LifecycleActor {
  if (actor === undefined) return { id: 'tester' };
  return typeof actor === 'string' ? { id: actor } : actor;
}

export function createHarness(options: HarnessOptions) {
  const clock = new Date('2026-10-01T09:00:00Z').getTime();
  const store = new MemoryLifecycleStore();
  const runtime = new LifecycleRuntime({
    store,
    clock: (): Date => new Date(clock),
  });
  const services: TestServices = {
    directory: {
      isActive: (person) => options.people.includes(person),
      managerOf: (person) => options.managers?.[person],
      hasRole: (person, role) =>
        options.roles?.[role]?.includes(person) === true,
    },
  };
  const lifecycles: Lifecycle<LifecycleTypes>[] = [
    ...options.lifecycles,
    ...options.approvals.map(
      (approval) => approval.lifecycle as unknown as Lifecycle<LifecycleTypes>,
    ),
  ];
  const collections = new Map<string, string>();
  for (const lifecycle of lifecycles) {
    collections.set(lifecycle.name, lifecycle.collection);
    runtime.register(lifecycle, { services: services as never });
  }
  const approvals = new ApprovalService(runtime, options.approvals, services);

  const harness = {
    runtime,
    approvals,
    async create(
      lifecycle: string,
      values: Readonly<Record<string, unknown>>,
      actor?: string,
    ): Promise<LifecycleRecord> {
      const { record } = await runtime.create(lifecycle, values, {
        actor: actorOf(actor),
      });
      return harness.get(lifecycle, record.id);
    },
    async fire(
      lifecycle: string,
      id: RecordId,
      transition: string,
      input: JsonObject = {},
      actor?: string,
    ): Promise<LifecycleRecord> {
      await runtime.fire(lifecycle, id, transition, {
        actor: actorOf(actor),
        input,
      });
      return harness.get(lifecycle, id);
    },
    get(lifecycle: string, id: RecordId): LifecycleRecord {
      const collection = collections.get(lifecycle);
      const record = collection ? store.record(collection, id) : undefined;
      if (!record) throw new Error(`No ${lifecycle} record "${String(id)}".`);
      return record;
    },
    runs(lifecycle: string, id: RecordId): Promise<RunRow[]> {
      return approvals.runsFor(lifecycle, id);
    },
    /** The transitions of the record's last run: the stages it went through. */
    async runHistory(lifecycle: string, id: RecordId): Promise<string[]> {
      const run = (await approvals.runsFor(lifecycle, id)).at(-1);
      if (!run) return [];
      return (
        await runtime.history(`approval:${run.source}`, run.id)
      ).transitions.map((entry) => entry.transition);
    },
    /** The stage the record's last run waits in, or how it ended. */
    async stage(lifecycle: string, id: RecordId): Promise<string | undefined> {
      return (await approvals.runsFor(lifecycle, id)).at(-1)?.status;
    },
    /** The open tasks of a record, as `assignee:status`. */
    async open(lifecycle: string, id: RecordId): Promise<string[]> {
      return (await approvals.tasksFor(lifecycle, id))
        .filter((task) => OPEN.includes(task.status))
        .map((task) => `${task.assigneeId}:${task.status}`);
    },
    /** The task `person` would act on now. */
    async taskOf(
      lifecycle: string,
      id: RecordId,
      person: string,
    ): Promise<TaskRow> {
      const [mine] = await approvals.actionsFor(lifecycle, id, {
        id: person,
      });
      if (!mine)
        throw new ApprovalError(
          'NOT_ASSIGNEE',
          `${person} has no task on ${lifecycle} "${String(id)}".`,
        );
      return mine.task;
    },
    /** `person` answers their task on the record. */
    async answer(
      lifecycle: string,
      id: RecordId,
      person: string,
      answer = 'approve',
    ): Promise<Answered> {
      const task = await harness.taskOf(lifecycle, id, person);
      return approvals.respond({
        taskId: task.id,
        actor: { id: person },
        answer,
        ...(answer === 'reject' ? { comment: 'No.' } : {}),
      });
    },
  };
  return harness;
}

export type Harness = ReturnType<typeof createHarness>;

export async function refusal(
  promise: Promise<unknown>,
): Promise<{ code: string; message: string }> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(Error);
  return error as { code: string; message: string };
}
