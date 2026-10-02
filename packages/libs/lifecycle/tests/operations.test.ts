// What an operator and a careful caller need: a repeated request that
// changes nothing, a retry policy, a timeout, and runs that can be listed,
// retried, cancelled and pruned.
import { describe, expect, it } from 'vitest';

import {
  defineEffect,
  defineLifecycle,
  LifecycleRuntime,
  MemoryLifecycleStore,
  type EffectDispatcher,
  type LifecycleRecord,
} from '../src/index.js';

type State = 'open' | 'sent' | 'failed' | 'done';

interface Invoice extends LifecycleRecord {
  readonly status: State;
}

interface Controls {
  send(attempt: number, signal: AbortSignal): Promise<unknown>;
}

interface InvoiceTypes {
  record: Invoice;
  state: State;
  parameters: object;
  services: Controls;
}

class Declined extends Error {}

const send = defineEffect<InvoiceTypes>({
  name: 'invoices.send',
  retry: {
    attempts: 4,
    backoffMs: 1_000,
    factor: 3,
    maxMs: 5_000,
    shouldRetry: (error) => !(error instanceof Declined),
  },
  timeoutMs: 50,
  onSuccess: 'deliver',
  onFailure: 'fail',
  run: ({ services, attempt, signal }) => services.send(attempt, signal),
});

const invoices = defineLifecycle<InvoiceTypes>({
  name: 'invoices',
  initial: 'open',
  states: [
    'open',
    'sent',
    { name: 'failed', final: true },
    { name: 'done', final: true },
  ],
  transitions: {
    send: { from: 'open', to: 'sent', effects: [send] },
    deliver: { from: 'sent', to: 'done' },
    fail: { from: 'sent', to: 'failed' },
  },
});

class HeldDispatcher implements EffectDispatcher {
  public readonly handed: { runId: string; runAfter: string | null }[] = [];

  public dispatch(
    runId: string,
    options: { readonly runAfter: string | null },
  ): Promise<void> {
    this.handed.push({ runId, runAfter: options.runAfter });
    return Promise.resolve();
  }
}

function setup(options: { held?: boolean } = {}) {
  const store = new MemoryLifecycleStore();
  const dispatcher = new HeldDispatcher();
  let now = Date.parse('2026-10-01T09:00:00Z');
  const controls: Controls = { send: () => Promise.resolve({ ok: true }) };
  const runtime = new LifecycleRuntime({
    store,
    clock: () => new Date(now),
    ...(options.held ? { dispatcher } : {}),
  });
  runtime.register(invoices, { services: controls });
  const invoice = store.insertRecord('invoices', {
    status: 'open',
    statusChangedAt: new Date(now).toISOString(),
    lifecycleVersion: 0,
  });
  return {
    store,
    runtime,
    dispatcher,
    controls,
    id: invoice.id,
    record: () => store.record('invoices', invoice.id) as Invoice,
    advance: (ms: number): void => {
      now += ms;
    },
  };
}

describe('repeated requests', () => {
  it('replays a request sent twice instead of firing it again', async () => {
    const { runtime, id, record } = setup({ held: true });
    const first = await runtime.fire('invoices', id, 'send', {
      actor: { id: 'clerk' },
      requestId: 'form-1',
    });
    const again = await runtime.fire('invoices', id, 'send', {
      actor: { id: 'clerk' },
      requestId: 'form-1',
    });
    expect(again).toMatchObject({ replayed: true, effectRuns: [] });
    expect(again.entry).toEqual(first.entry);
    expect(record()).toMatchObject({ status: 'sent', lifecycleVersion: 1 });
    expect((await runtime.history('invoices', id)).transitions).toHaveLength(1);
    // A new request is a new decision, and this one the state refuses.
    await expect(
      runtime.fire('invoices', id, 'send', {
        actor: { id: 'clerk' },
        requestId: 'form-2',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});

describe('retry policy', () => {
  it('backs off by a factor up to a cap', async () => {
    const { runtime, id, dispatcher, controls, advance } = setup({
      held: true,
    });
    controls.send = () => Promise.reject(new Error('The mail server is down.'));
    await runtime.fire('invoices', id, 'send', { actor: { id: 'clerk' } });
    const runId = dispatcher.handed[0]!.runId;
    const delays: number[] = [];
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const before = Date.parse('2026-10-01T09:00:00Z');
      await runtime.runEffect(runId);
      const due = dispatcher.handed.at(-1)!.runAfter!;
      delays.push(Date.parse(due) - before);
      advance(0);
    }
    expect(delays).toEqual([1_000, 3_000, 5_000]);
  });

  it('fails at once when the error is not worth another attempt', async () => {
    const { runtime, id, controls, record } = setup();
    let calls = 0;
    controls.send = () => {
      calls += 1;
      return Promise.reject(new Declined('The card was declined.'));
    };
    await runtime.fire('invoices', id, 'send', { actor: { id: 'clerk' } });
    expect(calls).toBe(1);
    expect(record().status).toBe('failed');
    const [run] = (await runtime.history('invoices', id)).effectRuns;
    expect(run).toMatchObject({ status: 'failed', attempts: 1 });
  });

  it('fails an attempt that runs past its timeout, and aborts its signal', async () => {
    const { runtime, id, controls, dispatcher } = setup({ held: true });
    let aborted = false;
    controls.send = (_, signal) =>
      new Promise(() => {
        signal.addEventListener('abort', () => {
          aborted = true;
        });
      });
    await runtime.fire('invoices', id, 'send', { actor: { id: 'clerk' } });
    const run = await runtime.runEffect(dispatcher.handed[0]!.runId);
    expect(run).toMatchObject({
      status: 'queued',
      attempts: 1,
      error: 'Timed out after 50 ms.',
    });
    expect(aborted).toBe(true);
  });
});

describe('operating runs', () => {
  it('retries a failed run from its first attempt', async () => {
    const { runtime, id, controls, store } = setup();
    controls.send = () => Promise.reject(new Declined('Declined.'));
    await runtime.fire('invoices', id, 'send', { actor: { id: 'clerk' } });
    const [failed] = (await runtime.history('invoices', id)).effectRuns;
    controls.send = () => Promise.resolve({ ok: true });
    const retried = await runtime.retryRun(failed!.id);
    expect(retried).toMatchObject({ status: 'succeeded', attempts: 1 });
    // The record had already failed over, so the late success leads nowhere.
    expect(store.record('invoices', id)).toMatchObject({ status: 'failed' });
    await expect(runtime.retryRun(failed!.id)).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
  });

  it('cancels a queued run, so nothing follows from it', async () => {
    const { runtime, id, dispatcher, record } = setup({ held: true });
    await runtime.fire('invoices', id, 'send', { actor: { id: 'clerk' } });
    const runId = dispatcher.handed[0]!.runId;
    expect(await runtime.cancelRun(runId)).toMatchObject({
      status: 'cancelled',
    });
    expect(await runtime.runEffect(runId)).toMatchObject({
      status: 'cancelled',
    });
    expect(record().status).toBe('sent');
  });

  it('aborts a running attempt it cancels, and discards its outcome', async () => {
    const { runtime, id, dispatcher, controls, record } = setup({ held: true });
    let release!: () => void;
    let aborted = false;
    controls.send = (_, signal) => {
      signal.addEventListener('abort', () => {
        aborted = true;
      });
      return new Promise((resolve) => {
        release = () => resolve({ ok: true });
      });
    };
    await runtime.fire('invoices', id, 'send', { actor: { id: 'clerk' } });
    const runId = dispatcher.handed[0]!.runId;
    const attempt = runtime.runEffect(runId);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await runtime.cancelRun(runId);
    expect(aborted).toBe(true);
    release();
    expect(await attempt).toMatchObject({ status: 'cancelled' });
    expect(record().status).toBe('sent');
  });

  it('lists runs with whether this process knows their effect', async () => {
    const { runtime, store, id } = setup({ held: true });
    await runtime.fire('invoices', id, 'send', { actor: { id: 'clerk' } });
    await store.createEffectRun({
      transitionId: '1',
      lifecycle: 'invoices',
      recordId: String(id),
      effect: 'invoices.renamedLongAgo',
      status: 'queued',
      attempts: 0,
      maxAttempts: 1,
      result: null,
      error: null,
      createdAt: '2026-10-01T09:00:00.000Z',
      updatedAt: '2026-10-01T09:00:00.000Z',
      claimedAt: null,
      runAfter: null,
    });
    expect(
      (await runtime.listEffectRuns({ status: 'queued' })).map(
        (run) => `${run.effect}:${run.registered}`,
      ),
    ).toEqual(['invoices.send:true', 'invoices.renamedLongAgo:false']);
    expect(
      await runtime.listEffectRuns({ effect: 'invoices.renamedLongAgo' }),
    ).toHaveLength(1);
  });

  it('prunes finished runs older than a cutoff, and keeps the rest', async () => {
    const { runtime, id, advance, store } = setup();
    await runtime.fire('invoices', id, 'send', { actor: { id: 'clerk' } });
    const other = store.insertRecord('invoices', {
      status: 'open',
      statusChangedAt: '2026-10-01T09:00:00.000Z',
      lifecycleVersion: 0,
    });
    advance(10 * 86_400_000);
    expect(
      await runtime.prune({
        olderThan: new Date(Date.parse('2026-10-05T00:00:00Z')),
      }),
    ).toBe(1);
    expect(await runtime.listEffectRuns({})).toEqual([]);
    expect((await runtime.history('invoices', id)).transitions).toHaveLength(2);
    expect(other.status).toBe('open');
  });
});
