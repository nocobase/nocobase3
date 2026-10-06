// A runtime holding the scenarios' lifecycles on one memory store,
// with a fake clock, the organization, an outbox and fake external systems,
// and the approval layer's service over the approvals under test. Each
// approval's run lifecycle is registered beside the business lifecycles.
// Services are built from the transaction handle, so the approval layer and
// the scenarios read and write through the transaction they run in.
import {
  LifecycleRuntime,
  MemoryLifecycleStore,
  type FireOptions,
  type JsonObject,
  type Lifecycle,
  type LifecycleActor,
  type LifecycleRecord,
  type LifecycleTypes,
  type MemoryRows,
  type RecordId,
} from '@nocobase/lifecycle';
import { expect } from 'vitest';

import { OrgDirectory, type OrgSnapshot } from '../../server/scenarios/org.js';
import type {
  RecordAccess,
  ScenarioServices,
} from '../../server/scenarios/services.js';
import {
  ApprovalError,
  ApprovalService,
  isOpenRun,
  type Answered,
  type Approval,
  type EventRow,
  type RunRow,
  type TaskRow,
} from '@nocobase/app-plugin-approval/server';
import { FakeExternal, type SentMessage } from './services.js';

export { FakeExternal };

export interface HarnessOptions {
  readonly org: OrgSnapshot;
  readonly now?: string;
  readonly lifecycles: readonly Lifecycle<LifecycleTypes>[];
  readonly approvals?: readonly Approval<never>[];
  readonly parameters?: Readonly<Record<string, Record<string, unknown>>>;
}

function actorOf(actor: string | LifecycleActor | undefined): LifecycleActor {
  if (actor === undefined) return { id: 'tester' };
  return typeof actor === 'string' ? { id: actor } : actor;
}

function recordsOf(rows: MemoryRows): RecordAccess {
  const matches = (
    record: LifecycleRecord,
    match: Readonly<Record<string, unknown>>,
  ): boolean =>
    Object.entries(match).every(([field, value]) =>
      value === null
        ? record[field] === null || record[field] === undefined
        : record[field] === value,
    );
  return {
    get: (collection, id) => Promise.resolve(rows.record(collection, id)),
    list: (collection, where) =>
      Promise.resolve(rows.records(collection).filter(where)),
    find: (collection, match) =>
      Promise.resolve(
        rows.records(collection).filter((record) => matches(record, match)),
      ),
    insert: (collection, values) =>
      Promise.resolve(rows.insertRecord(collection, values)),
    update: (collection, id, values) => {
      rows.patchRecord(collection, id, values);
      return Promise.resolve();
    },
  };
}

export function createHarness(options: HarnessOptions) {
  let clock = new Date(options.now ?? '2026-10-01T09:00:00Z').getTime();
  const store = new MemoryLifecycleStore();
  const runtime = new LifecycleRuntime({
    store,
    clock: (): Date => new Date(clock),
  });
  const org = new OrgDirectory(options.org);
  const external = new FakeExternal();
  const sent: SentMessage[] = [];
  const delivered = new Set<string>();
  const lifecycles: Lifecycle<LifecycleTypes>[] = [
    ...options.lifecycles,
    ...(options.approvals ?? []).map(
      (approval) => approval.lifecycle as unknown as Lifecycle<LifecycleTypes>,
    ),
  ];
  const collections = new Map<string, string>();
  for (const lifecycle of lifecycles)
    collections.set(lifecycle.name, lifecycle.collection);
  const collectionOf = (lifecycle: string): string => {
    const collection = collections.get(lifecycle);
    if (!collection)
      throw new Error(`Lifecycle "${lifecycle}" is not in the harness.`);
    return collection;
  };

  const servicesFor = (handle: unknown): ScenarioServices => ({
    org,
    records: recordsOf((handle as MemoryRows | undefined) ?? store),
    lifecycles: runtime,
    outbox: {
      send: (to, subject, key) => {
        if (delivered.has(key)) return;
        delivered.add(key);
        sent.push({ to, subject, key });
      },
    },
    external,
    approvals: service,
  });
  // Built after the services it is handed; they read it only when called.
  const service: ApprovalService = new ApprovalService(
    runtime,
    options.approvals ?? [],
    servicesFor,
  );
  for (const lifecycle of lifecycles) {
    const overrides = options.parameters?.[lifecycle.name] ?? {};
    runtime.register(lifecycle, {
      services: servicesFor as never,
      parameters: () => overrides as never,
    });
  }

  const harness = {
    runtime,
    store,
    org,
    external,
    sent,
    approvals: service,
    now: (): Date => new Date(clock),
    advance: ({
      days = 0,
      hours = 0,
      minutes = 0,
    }: {
      days?: number;
      hours?: number;
      minutes?: number;
    }): void => {
      clock += days * 86_400_000 + hours * 3_600_000 + minutes * 60_000;
    },
    async create(
      lifecycle: string,
      values: Readonly<Record<string, unknown>>,
      actor?: string | LifecycleActor,
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
      actor?: string | LifecycleActor,
      extra: Omit<FireOptions, 'actor' | 'input'> = {},
    ): Promise<LifecycleRecord> {
      await runtime.fire(lifecycle, id, transition, {
        ...extra,
        actor: actorOf(actor),
        input,
      });
      return harness.get(lifecycle, id);
    },
    get(lifecycle: string, id: RecordId): LifecycleRecord {
      const record = store.record(collectionOf(lifecycle), id);
      if (!record) throw new Error(`No ${lifecycle} record "${String(id)}".`);
      return record;
    },
    all(lifecycle: string): LifecycleRecord[] {
      return store.records(collectionOf(lifecycle));
    },
    async history(lifecycle: string, id: RecordId): Promise<string[]> {
      return (await runtime.history(lifecycle, id)).transitions.map(
        (entry) => entry.transition,
      );
    },
    async allowed(
      lifecycle: string,
      id: RecordId,
      actor: string | LifecycleActor,
    ): Promise<string[]> {
      return (await runtime.available(lifecycle, id, actorOf(actor)))
        .filter((transition) => transition.allowed)
        .map((transition) => transition.name);
    },
    messagesTo(person: string): string[] {
      return sent
        .filter((message) => message.to === person)
        .map((message) => message.subject);
    },
    // ----------------------------------------------- the second layer
    tasks(lifecycle: string, id: RecordId): Promise<TaskRow[]> {
      return service.tasksFor(lifecycle, id);
    },
    /** The open tasks of a record, as `assignee:status`. */
    async open(lifecycle: string, id: RecordId): Promise<string[]> {
      return (await service.tasksFor(lifecycle, id))
        .filter((task) =>
          [
            'pending',
            'waiting',
            'blocked',
            'candidate',
            'claimed',
            'suspended',
          ].includes(task.status),
        )
        .map((task) => `${task.assigneeId}:${task.status}`);
    },
    runs(lifecycle: string, id: RecordId): Promise<RunRow[]> {
      return service.runsFor(lifecycle, id);
    },
    /** The transitions of the record's last approval run, the stages it went through. */
    async runHistory(lifecycle: string, id: RecordId): Promise<string[]> {
      const run = (await service.runsFor(lifecycle, id)).at(-1);
      if (!run) return [];
      return (
        await runtime.history(`approval:${run.source}`, run.id)
      ).transitions.map((entry) => entry.transition);
    },
    /** Where the record is: the stage of its approval run while one decides, otherwise its own state. */
    async where(lifecycle: string, id: RecordId): Promise<string> {
      const run = (await service.runsFor(lifecycle, id)).at(-1);
      return run && isOpenRun(run)
        ? run.status
        : String(harness.get(lifecycle, id).status);
    },
    /** The stage the record's approval run waits in, or how its last run ended. */
    async stage(lifecycle: string, id: RecordId): Promise<string | undefined> {
      return (await service.runsFor(lifecycle, id)).at(-1)?.status;
    },
    events(lifecycle: string, id: RecordId): Promise<EventRow[]> {
      return service.eventsFor(lifecycle, id);
    },
    /** The task `person` would act on: their own, or one they hold by delegation. */
    async taskOf(
      lifecycle: string,
      id: RecordId,
      person: string,
    ): Promise<TaskRow> {
      const mine = await service.actionsFor(lifecycle, id, { id: person });
      const found = mine[0]?.task;
      if (found) return found;
      const any = (await service.tasksFor(lifecycle, id))
        .filter((task) => task.assigneeId === person)
        .at(-1);
      if (!any)
        throw new ApprovalError(
          'NOT_ASSIGNEE',
          `${person} has no task on ${lifecycle} "${String(id)}".`,
        );
      return any;
    },
    /** `person` answers their task on the record. */
    async answer(
      lifecycle: string,
      id: RecordId,
      person: string,
      answer = 'approve',
      comment: string | undefined = answer === 'reject' ? 'No.' : undefined,
      extra: {
        readonly requestId?: string;
        readonly contentHash?: string;
      } = {},
    ): Promise<Answered> {
      const task = await harness.taskOf(lifecycle, id, person);
      return service.respond({
        taskId: task.id,
        actor: { id: person },
        answer,
        ...(comment === undefined ? {} : { comment }),
        ...extra,
      });
    },
    /** What `person` may do on the record, as `taskAssignee:action`. */
    async actions(
      lifecycle: string,
      id: RecordId,
      person: string,
    ): Promise<string[]> {
      return (await service.actionsFor(lifecycle, id, { id: person })).flatMap(
        (each) =>
          each.actions.map((action) => `${each.task.assigneeId}:${action}`),
      );
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
