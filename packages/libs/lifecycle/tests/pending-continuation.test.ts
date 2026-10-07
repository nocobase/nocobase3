// An effect's continuation that cannot be fired as this process defines it —
// an old definition in a rolling deploy, a bug in `set` or `route` — waits on
// the run instead of being lost: the outcome is recorded once and the effect
// never runs again, the sweep tries the continuation again until it fires or
// the record moves on, and `continueRun()` tries it at once.
import { describe, expect, it, vi } from 'vitest';

import {
  defineEffect,
  defineLifecycle,
  EffectFailure,
  LifecycleError,
  LifecycleRuntime,
  MemoryLifecycleStore,
  SYSTEM_ACTOR,
  lifecycleErrorFields,
  type EffectDispatcher,
  type Lifecycle,
  type LifecycleLogger,
  type LifecycleRecord,
} from '../src/index.js';

interface Task extends LifecycleRecord {
  readonly status: 'todo' | 'working' | 'done' | 'stuck' | 'dropped';
  readonly reference?: string;
}

interface Services {
  /** What the effects did, in order. */
  readonly calls: string[];
  /** Whether `finish` is broken, as a bug in its `set` would make it. */
  readonly flags: { broken: boolean; fail: boolean };
}

interface TaskTypes {
  record: Task;
  state: Task['status'];
  services: Services;
}

const work = defineEffect<TaskTypes>({
  name: 'tasks.work',
  onSuccess: 'finish',
  onFailure: 'giveUp',
  run: ({ services }) => {
    services.calls.push('tasks.work');
    if (services.flags.fail)
      throw new EffectFailure('declined', 'The provider declined.');
    return { reference: 'R-1' };
  },
});

const archive = defineEffect<TaskTypes>({
  name: 'tasks.archive',
  run: ({ services }) => void services.calls.push('tasks.archive'),
});

/** `set` writes a field the lifecycle owns while `broken` is on: INVALID_SET. */
function brokenSet(services: Services): Partial<Task> {
  return services.flags.broken
    ? ({ lifecycleVersion: 99 } as unknown as Partial<Task>)
    : {};
}

const tasks: Lifecycle<TaskTypes> = defineLifecycle<TaskTypes>({
  name: 'tasks',
  initial: 'todo',
  states: [
    'todo',
    'working',
    { name: 'done', final: true },
    { name: 'stuck', final: true },
    { name: 'dropped', final: true },
  ],
  transitions: {
    start: { from: 'todo', to: 'working', effects: [work] },
    finish: {
      from: 'working',
      to: 'done',
      accept: ['reference'],
      set: ({ services }) => brokenSet(services),
    },
    giveUp: {
      from: 'working',
      to: 'stuck',
      set: ({ services }) => brokenSet(services),
    },
    drop: { from: 'working', to: 'dropped' },
  },
  onEnter: { done: [archive] },
});

/** Keeps every run it is handed, so a test runs each one when it chooses. */
class HeldDispatcher implements EffectDispatcher {
  public readonly handed: string[] = [];

  public dispatch(runId: string): Promise<void> {
    this.handed.push(runId);
    return Promise.resolve();
  }
}

function setup(options: { readonly batchSize?: number } = {}) {
  const store = new MemoryLifecycleStore();
  const clock = { now: new Date('2026-10-01T09:00:00.000Z') };
  /** Moves the fake clock on by `ms`. */
  const advance = (ms: number): void => {
    clock.now = new Date(clock.now.getTime() + ms);
  };
  const dispatcher = new HeldDispatcher();
  const logger = {
    warn: vi.fn<LifecycleLogger['warn']>(),
    error: vi.fn<LifecycleLogger['error']>(),
  };
  const services: Services = {
    calls: [],
    flags: { broken: true, fail: false },
  };
  const heard: string[] = [];
  const runtime = new LifecycleRuntime({
    store,
    dispatcher,
    logger,
    clock: () => clock.now,
    ...(options.batchSize === undefined
      ? {}
      : { continuations: { batchSize: options.batchSize } }),
  });
  runtime.register(tasks, { services });
  runtime.on('completed', {}, ({ transition }) => void heard.push(transition));
  const task = store.insertRecord('tasks', {
    status: 'todo',
    lifecycleVersion: 0,
  });
  return {
    store,
    dispatcher,
    logger,
    services,
    heard,
    runtime,
    task,
    advance,
  };
}

const MINUTE = 60_000;

type Context = ReturnType<typeof setup>;

/** Starts the task and runs its effect once, with `finish` still broken. */
async function workOnce(context: Context): Promise<string> {
  const started = await context.runtime.fire(
    'tasks',
    context.task.id,
    'start',
    {
      actor: SYSTEM_ACTOR,
    },
  );
  const runId = started.effectRuns[0].id;
  await context.runtime.runEffect(runId);
  context.heard.length = 0;
  return runId;
}

describe('a continuation that cannot be fired as defined', () => {
  it('waits on the run, the outcome recorded and the effect run once', async () => {
    const context = setup();
    const runId = await workOnce(context);

    const run = await context.store.findEffectRun(runId);
    expect(run).toMatchObject({
      status: 'succeeded',
      attempts: 1,
      result: { reference: 'R-1' },
      continuation: {
        transition: 'finish',
        outcome: 'succeeded',
        input: { reference: 'R-1' },
        code: 'INVALID_SET',
        attempts: 1,
        failedAt: '2026-10-01T09:00:00.000Z',
        // The default backoff: a minute after the first refusal.
        dueAt: '2026-10-01T09:01:00.000Z',
      },
    });
    expect(context.services.calls).toEqual(['tasks.work']);
    expect(context.store.record('tasks', context.task.id)).toMatchObject({
      status: 'working',
      lifecycleVersion: 1,
    });
    expect(context.logger.error).toHaveBeenCalledTimes(1);
    expect(context.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('may not set "lifecycleVersion"'),
      expect.objectContaining({ runId, code: 'INVALID_SET' }),
    );
    // An operations page finds it.
    await expect(
      context.runtime.listEffectRuns({ continuationPending: true }),
    ).resolves.toMatchObject([{ id: runId, registered: true }]);
    await expect(
      context.runtime.listEffectRuns({ continuationPending: false }),
    ).resolves.toEqual([]);
  });

  it('is tried again by the sweep once due, and fires once the definition is fixed', async () => {
    const context = setup();
    const runId = await workOnce(context);

    // Not due yet: the sweep leaves it alone.
    await expect(context.runtime.reclaim()).resolves.toBe(0);
    expect(await context.store.findEffectRun(runId)).toMatchObject({
      continuation: { attempts: 1 },
    });
    // Due and still broken: it stays pending, counts the try, waits twice as
    // long, and is logged no more loudly than before.
    context.advance(MINUTE);
    await expect(context.runtime.reclaim()).resolves.toBe(0);
    expect(await context.store.findEffectRun(runId)).toMatchObject({
      status: 'succeeded',
      continuation: {
        attempts: 2,
        code: 'INVALID_SET',
        dueAt: '2026-10-01T09:03:00.000Z',
      },
    });
    context.advance(MINUTE);
    await context.runtime.reclaim();
    expect(await context.store.findEffectRun(runId)).toMatchObject({
      continuation: { attempts: 2 },
    });
    context.advance(MINUTE);
    await context.runtime.reclaim();
    expect(await context.store.findEffectRun(runId)).toMatchObject({
      continuation: { attempts: 3, dueAt: '2026-10-01T09:07:00.000Z' },
    });
    expect(context.logger.error).toHaveBeenCalledTimes(1);
    expect(context.logger.warn).toHaveBeenCalledTimes(1);
    expect(context.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('could not continue with "finish"'),
      expect.objectContaining({ runId, attempts: 2 }),
    );
    expect(context.store.record('tasks', context.task.id)?.status).toBe(
      'working',
    );

    // The fix is deployed: the next sweep it is due on fires it.
    context.services.flags.broken = false;
    context.advance(4 * MINUTE);
    await expect(context.runtime.reclaim()).resolves.toBe(1);
    expect(context.store.record('tasks', context.task.id)).toMatchObject({
      status: 'done',
      reference: 'R-1',
    });
    expect(await context.store.findEffectRun(runId)).toMatchObject({
      status: 'succeeded',
      continuation: null,
    });
    expect(context.heard).toEqual(['finish']);
    const history = await context.runtime.history('tasks', context.task.id);
    expect(history.transitions.at(-1)).toMatchObject({
      transition: 'finish',
      requestId: `$run:${runId}:succeeded`,
    });
    // The entered state's effect is handed over; the effect itself is not
    // run again.
    const archived = history.effectRuns.find(
      (each) => each.effect === 'tasks.archive',
    );
    expect(context.dispatcher.handed).toEqual([runId, archived?.id]);
    expect(context.services.calls).toEqual(['tasks.work']);

    // Nothing is left to try.
    await expect(context.runtime.reclaim()).resolves.toBe(0);
    expect(context.heard).toEqual(['finish']);
  });

  it('is continued at once by continueRun()', async () => {
    const context = setup();
    const runId = await workOnce(context);

    // Still broken: the refusal is thrown and the continuation stays.
    const refused = await context.runtime.continueRun(runId).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(LifecycleError);
    expect(refused).toMatchObject({ code: 'INVALID_SET' });
    expect(await context.store.findEffectRun(runId)).toMatchObject({
      continuation: { attempts: 2 },
    });

    context.services.flags.broken = false;
    await expect(context.runtime.continueRun(runId)).resolves.toMatchObject({
      id: runId,
      status: 'succeeded',
      continuation: null,
    });
    expect(context.store.record('tasks', context.task.id)?.status).toBe('done');
    expect(context.heard).toEqual(['finish']);
    expect(context.services.calls).toEqual(['tasks.work']);

    // Nothing is pending any more.
    const none = await context.runtime.continueRun(runId).then(
      () => undefined,
      (error: unknown) => error as LifecycleError,
    );
    expect(none).toMatchObject({ code: 'NO_CONTINUATION' });
    expect(none && lifecycleErrorFields(none)).toMatchObject({
      status: 'FAILED_PRECONDITION',
      reason: 'NO_CONTINUATION',
    });
    await expect(context.runtime.continueRun('missing')).resolves.toBe(
      undefined,
    );
  });

  it('is continued by a process with the fixed definition, in a rolling deploy', async () => {
    const context = setup();
    const runId = await workOnce(context);
    // The new process shares the store and runs the fixed definition.
    const services: Services = {
      calls: [],
      flags: { broken: false, fail: false },
    };
    const deployed = new LifecycleRuntime({
      store: context.store,
      dispatcher: context.dispatcher,
      clock: () => new Date('2026-10-01T10:00:00.000Z'),
    });
    deployed.register(tasks, { services });
    await expect(deployed.reclaim()).resolves.toBe(1);
    expect(context.store.record('tasks', context.task.id)?.status).toBe('done');
    expect(await context.store.findEffectRun(runId)).toMatchObject({
      continuation: null,
    });
    expect([...context.services.calls, ...services.calls]).toEqual([
      'tasks.work',
    ]);
  });

  it('keeps the failure of a failed run as the input onFailure receives', async () => {
    const context = setup();
    context.services.flags.fail = true;
    const runId = await workOnce(context);
    expect(await context.store.findEffectRun(runId)).toMatchObject({
      status: 'failed',
      continuation: {
        transition: 'giveUp',
        outcome: 'failed',
        input: {
          error: 'The provider declined.',
          errorCode: 'declined',
          details: {},
        },
      },
    });

    // Its onFailure is still due, so a retry would do the work again.
    await expect(context.runtime.retryRun(runId)).rejects.toMatchObject({
      code: 'RUN_SETTLED',
    });

    context.services.flags.broken = false;
    await context.runtime.continueRun(runId);
    expect(context.store.record('tasks', context.task.id)?.status).toBe(
      'stuck',
    );
    // Now it is settled the usual way, by its log entry.
    await expect(context.runtime.retryRun(runId)).rejects.toMatchObject({
      code: 'RUN_SETTLED',
    });
    expect(context.services.calls).toEqual(['tasks.work']);
  });

  it('is dropped by a forced retry, which runs the effect again', async () => {
    const context = setup();
    context.services.flags.fail = true;
    const runId = await workOnce(context);
    context.services.flags.fail = false;
    context.services.flags.broken = false;
    await expect(
      context.runtime.retryRun(runId, { force: true, reason: 'test' }),
    ).resolves.toMatchObject({ status: 'queued', continuation: null });
    await context.runtime.runEffect(runId);
    expect(context.store.record('tasks', context.task.id)?.status).toBe('done');
    await expect(context.runtime.reclaim()).resolves.toBe(0);
    expect(context.store.record('tasks', context.task.id)?.status).toBe('done');
  });

  it('backs off up to an hour', async () => {
    const context = setup();
    const runId = await workOnce(context);
    for (let sweep = 0; sweep < 8; sweep += 1) {
      context.advance(60 * MINUTE);
      await context.runtime.reclaim();
    }
    const run = await context.store.findEffectRun(runId);
    expect(run?.continuation?.attempts).toBe(9);
    expect(
      Date.parse(run?.continuation?.dueAt ?? '') -
        Date.parse(run?.continuation?.failedAt ?? ''),
    ).toBe(60 * MINUTE);
  });

  it('tries at most a batch per sweep, those due longest first', async () => {
    const context = setup({ batchSize: 2 });
    const runs: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const task = context.store.insertRecord('tasks', {
        status: 'todo',
        lifecycleVersion: 0,
      });
      const started = await context.runtime.fire('tasks', task.id, 'start', {
        actor: SYSTEM_ACTOR,
      });
      await context.runtime.runEffect(started.effectRuns[0].id);
      runs.push(started.effectRuns[0].id);
      // Each refused a second later than the one before.
      context.advance(1_000);
    }
    context.advance(MINUTE);
    await context.runtime.reclaim();
    const attempts = async (): Promise<(number | undefined)[]> =>
      Promise.all(
        runs.map(
          async (id) =>
            (await context.store.findEffectRun(id))?.continuation?.attempts,
        ),
      );
    expect(await attempts()).toEqual([2, 2, 1]);
    // The one left behind is due longest now, so the next sweep takes it.
    await context.runtime.reclaim();
    expect(await attempts()).toEqual([2, 2, 2]);
  });

  it('is never pruned while it waits', async () => {
    const context = setup();
    const runId = await workOnce(context);
    await expect(
      context.runtime.prune({ olderThan: '2026-12-01T00:00:00.000Z' }),
    ).resolves.toBe(0);
    expect(await context.store.findEffectRun(runId)).toBeDefined();
  });
});

describe('a continuation whose record moved on', () => {
  it('leaves nothing pending when the record moved before the outcome', async () => {
    const context = setup();
    context.services.flags.broken = false;
    const started = await context.runtime.fire(
      'tasks',
      context.task.id,
      'start',
      { actor: SYSTEM_ACTOR },
    );
    const runId = started.effectRuns[0].id;
    await context.runtime.fire('tasks', context.task.id, 'drop', {
      actor: SYSTEM_ACTOR,
    });
    await context.runtime.runEffect(runId);
    expect(await context.store.findEffectRun(runId)).toMatchObject({
      status: 'succeeded',
      continuation: null,
    });
    expect(context.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('could not continue with "finish"'),
      expect.objectContaining({ runId, code: 'INVALID_STATE' }),
    );
    expect(context.logger.error).not.toHaveBeenCalled();
  });

  it('is dropped by the sweep once the record has moved on meanwhile', async () => {
    const context = setup();
    const runId = await workOnce(context);
    await context.runtime.fire('tasks', context.task.id, 'drop', {
      actor: SYSTEM_ACTOR,
    });
    context.heard.length = 0;
    context.advance(MINUTE);
    await expect(context.runtime.reclaim()).resolves.toBe(0);
    expect(await context.store.findEffectRun(runId)).toMatchObject({
      continuation: null,
    });
    expect(context.store.record('tasks', context.task.id)?.status).toBe(
      'dropped',
    );
    expect(context.heard).toEqual([]);
    expect(context.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no longer continues with "finish"'),
      expect.objectContaining({ runId, code: 'INVALID_STATE' }),
    );
  });
});
