import { setImmediate } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bindAuditRecorder,
  SqliteAuditStore,
} from '@nocobase/app-plugin-audit/server';
import { createDatabaseManager } from '@nocobase/db';
import type {
  AuditRecorder,
  TrustedAuditScope,
} from '../../server/contracts.js';
import { NodeAuditScopeCarrier } from '../../server/scope.js';
import {
  TrustedAuditRuntime,
  type AuditBackgroundTrace,
} from '../../server/runtime.js';
import {
  createFixture,
  type Fixture,
  type RawClient,
} from './sqlite-fixture.js';

const event = { action: 'scope.write', outcome: 'success' as const };
const alice = { actor: { type: 'user', id: 'alice' }, roleIds: ['operator'] };
const bob = { actor: { type: 'user', id: 'bob' }, roleIds: ['reviewer'] };

function latch(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {
    throw new Error('Latch not initialized');
  };
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Ordinary domain service sees only the existing public Recorder contract. */
class OrdinaryService {
  constructor(readonly recorder: AuditRecorder) {}
  async write(action: string): Promise<void> {
    const receipt = await this.recorder.record({ ...event, action });
    if (receipt.state !== 'committed')
      throw new Error('Expected committed event');
  }
}

describe('trusted scope with durable public Recorder attribution', () => {
  let f: Fixture;
  let carrier: NodeAuditScopeCarrier;
  let runtime: TrustedAuditRuntime;
  let service: OrdinaryService;
  let diagnostics: string[];
  beforeEach(async () => {
    f = await createFixture();
    carrier = new NodeAuditScopeCarrier(f.scope.appId);
    diagnostics = [];
    runtime = new TrustedAuditRuntime({
      appId: f.scope.appId,
      carrier,
      bind: (scope) =>
        bindAuditRecorder(scope, {
          producer: 'trusted-runtime',
          store: f.store,
          policy: () => Promise.resolve(f.policy),
        }),
      diagnostic: (code) => {
        diagnostics.push(code);
      },
    });
    service = new OrdinaryService(runtime.recorder);
  });
  afterEach(async () => {
    runtime?.dispose();
    await f?.cleanup();
  });

  it('revokes a still-running child when its enclosing request has already ended', async () => {
    const release = latch();
    let detached: Promise<void> | undefined;
    await runtime.runRequest(async () => {
      detached = runtime.runAuthenticated(alice, async () => {
        await release.promise;
        await service.write('orphan.child');
      });
      await setImmediate();
    });
    release.resolve();
    await detached;
    const rows = (await f.store.query(f.scope, { store: 'main' })).items;
    expect(rows[0]?.actor.type).toBe('unknown');
  });

  it('keeps manager.query and cached root builders outside a same-manager transaction', async () => {
    const manager = createDatabaseManager({
      connections: {
        main: {
          dialect: 'sqlite',
          filename: f.directory + '/query-selection.sqlite',
          pool: { min: 0, max: 2 },
        },
      },
    });
    try {
      const root = manager.connection();
      const client = await root.client<RawClient>();
      await client.raw('CREATE TABLE selection (id INTEGER PRIMARY KEY)');
      const cached = root.query.insertInto('selection').values({ id: 2 });
      await expect(
        runtime.runRequest(() =>
          runtime.runAuthenticated(alice, () =>
            manager.transaction(async (transaction) => {
              // BEGIN is deferred, so these root writes can commit before the child writes.
              await manager
                .query()
                .insertInto('selection')
                .values({ id: 1 })
                .execute();
              await cached.execute();
              await transaction.query
                .insertInto('selection')
                .values({ id: 3 })
                .execute();
              await service.write('connection.selection');
              throw new Error('synthetic rollback');
            }),
          ),
        ),
      ).rejects.toThrow('synthetic rollback');
      expect(await client.raw('SELECT * FROM selection ORDER BY id')).toEqual([
        { id: 1 },
        { id: 2 },
      ]);
      expect(
        (await f.store.query(f.scope, { store: 'main' })).items[0]?.actor,
      ).toEqual(alice.actor);
    } finally {
      await manager.destroy();
    }
  });

  it('interleaves two users and two Apps through Promise.all without identity bleed', async () => {
    const otherScope = { appId: 'second-app', actor: { type: 'unknown' } };
    const otherStore = new SqliteAuditStore(f.connection, {
      appId: 'second-app',
      store: 'main',
    });
    await otherStore.prepare();
    const second = new TrustedAuditRuntime({
      appId: 'second-app',
      carrier: new NodeAuditScopeCarrier('second-app'),
      diagnostic: () => undefined,
      bind: (scope) =>
        bindAuditRecorder(scope, {
          producer: 'trusted-runtime',
          store: otherStore,
          policy: () => Promise.resolve(f.policy),
        }),
    });
    const arrivals = latch();
    let entered = 0;
    async function write(
      target: TrustedAuditRuntime,
      id: string,
    ): Promise<void> {
      await target.runRequest(() =>
        target.runAuthenticated({ actor: { type: 'user', id } }, async () => {
          if (++entered === 4) arrivals.resolve();
          await arrivals.promise;
          for (let index = 0; index < 3; index++) {
            await setImmediate();
            await new OrdinaryService(target.recorder).write(id + '.' + index);
          }
        }),
      );
    }
    try {
      await Promise.all([
        write(runtime, 'alice'),
        write(runtime, 'bob'),
        write(second, 'carol'),
        write(second, 'dan'),
      ]);
      const first = (await f.store.query(f.scope, { store: 'main' })).items;
      const other = (await otherStore.query(otherScope, { store: 'main' }))
        .items;
      expect(first).toHaveLength(6);
      expect(other).toHaveLength(6);
      for (const [items, appId, ids] of [
        [first, f.scope.appId, ['alice', 'bob']],
        [other, 'second-app', ['carol', 'dan']],
      ] as const) {
        for (const row of items) {
          expect(row.appId).toBe(appId);
          expect(ids).toContain(row.actor.id);
          expect(row.action).toBe(
            row.actor.id + '.' + row.action.split('.').at(-1),
          );
          expect(row.initiator).toEqual(row.actor);
          expect(row.requestId).toBeDefined();
        }
        expect(new Set(items.map((row) => row.requestId)).size).toBe(2);
      }
      expect(diagnostics).toEqual([]);
      expect(carrier.current()).toBeUndefined();
    } finally {
      second.dispose();
    }
  });

  it('preserves the original human across Agent, Workflow and human approval', async () => {
    await runtime.runRequest(() =>
      runtime.runAuthenticated(alice, async () => {
        await service.write('human');
        await runtime.runChild(
          { actor: { type: 'agent', id: 'agent-1' } },
          async () => {
            await service.write('agent');
            await runtime.runChild(
              { actor: { type: 'workflow', id: 'workflow-1' } },
              async () => {
                await service.write('workflow');
                await runtime.runChild(bob, () => service.write('approval'));
                await service.write('workflow.resumed');
              },
            );
          },
        );
        await service.write('human.resumed');
        await runtime.runAnonymous(() => service.write('anonymous'));
      }),
    );
    const rows = (await f.store.query(f.scope, { store: 'main' })).items;
    const byAction = new Map(rows.map((row) => [row.action, row]));
    for (const row of rows) expect(row.initiator).toEqual(alice.actor);
    expect(byAction.get('agent')?.actor.type).toBe('agent');
    expect(byAction.get('workflow')?.actor.type).toBe('workflow');
    expect(byAction.get('approval')).toMatchObject({
      actor: bob.actor,
      roleIds: bob.roleIds,
    });
    expect(byAction.get('workflow.resumed')?.actor.type).toBe('workflow');
    expect(byAction.get('human.resumed')?.actor).toEqual(alice.actor);
    expect(byAction.get('anonymous')?.actor.type).toBe('anonymous');
    expect(byAction.get('workflow')?.roleIds).toBeUndefined();
    for (const key of ['requestId', 'operationId', 'correlationId'] as const) {
      expect(new Set(rows.map((row) => row[key])).size).toBe(1);
    }
    const human = byAction.get('human');
    expect(
      new Set([human?.requestId, human?.operationId, human?.correlationId])
        .size,
    ).toBe(3);
    expect(
      new Set(
        ['agent', 'workflow', 'approval'].map(
          (action) => byAction.get(action)?.runId,
        ),
      ).size,
    ).toBe(3);
  });

  it('revokes request/job contexts after errors and restores an enclosing actor', async () => {
    await expect(
      runtime.runRequest(() =>
        runtime.runAuthenticated(alice, async () => {
          await expect(
            runtime.runChild(
              { actor: { type: 'job', id: 'failing' } },
              async () => {
                await service.write('job.before.throw');
                throw new Error('synthetic-job-error');
              },
            ),
          ).rejects.toThrow('synthetic-job-error');
          await service.write('request.restored');
          throw new Error('synthetic-request-error');
        }),
      ),
    ).rejects.toThrow('synthetic-request-error');
    expect(carrier.current()).toBeUndefined();
    await service.write('next.unknown');
    await runtime.runRequest(() => service.write('next.anonymous'));
    const rows = (await f.store.query(f.scope, { store: 'main' })).items;
    expect(
      rows.find((row) => row.action === 'request.restored')?.actor,
    ).toEqual(alice.actor);
    expect(rows.find((row) => row.action === 'next.unknown')?.actor.type).toBe(
      'unknown',
    );
    expect(
      rows.find((row) => row.action === 'next.anonymous')?.actor.type,
    ).toBe('anonymous');
    expect(() =>
      carrier.run(f.scope, () => {
        throw new Error('sync');
      }),
    ).toThrow('sync');
    expect(carrier.current()).toBeUndefined();
  });

  it('revokes detached asynchronous descendants after the callback settles', async () => {
    const release = latch();
    let detached: Promise<void> | undefined;
    await runtime.runRequest(() =>
      runtime.runAuthenticated(alice, async () => {
        detached = release.promise.then(() => service.write('detached'));
        await service.write('controlled');
      }),
    );
    release.resolve();
    await detached;
    const rows = (await f.store.query(f.scope, { store: 'main' })).items;
    expect(rows.find((row) => row.action === 'controlled')?.actor).toEqual(
      alice.actor,
    );
    expect(rows.find((row) => row.action === 'detached')?.actor.type).toBe(
      'unknown',
    );
  });

  it('disposal invalidates suspended scopes and refuses further Recorder writes', async () => {
    const release = latch();
    const pending = runtime.runRequest(() =>
      runtime.runAuthenticated(alice, async () => {
        await release.promise;
        expect(carrier.current()).toBeUndefined();
        expect(() => runtime.current()).toThrow('AUDIT_NOT_READY');
      }),
    );
    runtime.dispose();
    release.resolve();
    await pending;
    expect(() => runtime.runRequest(() => undefined)).toThrow(
      'AUDIT_NOT_READY',
    );
    await expect(service.write('after.dispose')).rejects.toThrow(
      'AUDIT_NOT_READY',
    );
    expect(
      (await f.store.query(f.scope, { store: 'main' })).items,
    ).toHaveLength(0);
  });

  it('snapshots carrier and recorder identities, rejects invalid bindings and never invokes accessors', async () => {
    const input = {
      ...f.scope,
      actor: { ...alice.actor },
      roleIds: ['operator', 'operator'],
      initiator: { ...alice.actor },
    };
    const options = {
      store: f.store,
      producer: 'original',
      policy: async () => f.policy,
    };
    const recorder = bindAuditRecorder(input, options);
    carrier.run(input, () => {
      input.actor.id = 'mutated';
      input.initiator.id = 'mutated';
      input.roleIds.push('admin');
      options.producer = 'mutated';
      expect(carrier.current()).toMatchObject({
        actor: alice.actor,
        initiator: alice.actor,
        roleIds: ['operator'],
      });
      expect(Object.isFrozen(carrier.current()?.actor)).toBe(true);
      expect(Object.isFrozen(carrier.current()?.initiator)).toBe(true);
      expect(Object.isFrozen(carrier.current()?.roleIds)).toBe(true);
    });
    await recorder.record(event);
    expect((await f.store.query(f.scope, { store: 'main' })).items).toEqual([
      expect.objectContaining({
        actor: alice.actor,
        initiator: alice.actor,
        roleIds: ['operator'],
        producer: 'original',
      }),
    ]);
    for (const producer of ['', 'invalid\n', 'x'.repeat(1025)])
      expect(() =>
        bindAuditRecorder(f.scope, { ...options, producer }),
      ).toThrow('AUDIT_INVALID_EVENT');
    expect(() =>
      carrier.run({ ...f.scope, appId: 'other' }, () => undefined),
    ).toThrow('AUDIT_INVALID_EVENT');
    let reads = 0;
    expect(() =>
      carrier.run(
        {
          ...f.scope,
          get actor() {
            reads++;
            return alice.actor;
          },
        },
        () => undefined,
      ),
    ).toThrow('AUDIT_INVALID_EVENT');
    expect(reads).toBe(0);
    expect(() =>
      bindAuditRecorder(
        {
          ...f.scope,
          get appId() {
            reads++;
            return f.scope.appId;
          },
        },
        options,
      ),
    ).toThrow('AUDIT_INVALID_EVENT');
    expect(reads).toBe(0);
  });

  it('revalidates an allowlisted background trace against trusted worker state before recording', async () => {
    let trace: AuditBackgroundTrace | undefined;
    let trusted: TrustedAuditScope | undefined;
    await runtime.runRequest(() =>
      runtime.runAuthenticated(alice, async () => {
        await service.write('enqueue');
        trace = JSON.parse(
          JSON.stringify(runtime.exportBackgroundTrace()),
        ) as AuditBackgroundTrace;
        trusted = runtime.current();
      }),
    );
    if (!trace || !trusted) throw new Error('Expected enqueue evidence');
    expect(Object.keys(trace).sort()).toEqual([
      'appId',
      'correlationId',
      'operationId',
      'requestId',
    ]);
    const stored = trusted;
    let verifications = 0;
    await runtime.runBackground(
      trace,
      (hints) => {
        verifications++;
        expect(hints.operationId).toBe(stored.operationId);
        return Promise.resolve({
          ...stored,
          actor: { type: 'workflow', id: 'worker' },
          roleIds: undefined,
          runId: 'worker-run',
        });
      },
      () => service.write('worker'),
    );
    expect(verifications).toBe(1);
    const rows = (await f.store.query(f.scope, { store: 'main' })).items;
    expect(rows.find((row) => row.action === 'worker')).toMatchObject({
      actor: { type: 'workflow', id: 'worker' },
      initiator: alice.actor,
      operationId: stored.operationId,
      runId: 'worker-run',
    });
    expect(carrier.current()).toBeUndefined();
    await expect(
      runtime.runBackground(
        trace,
        () => Promise.resolve(undefined),
        () => service.write('untrusted'),
      ),
    ).rejects.toThrow('AUDIT_INVALID_EVENT');
    await expect(
      runtime.runBackground(
        trace,
        () => Promise.resolve({ ...stored, appId: 'other' }),
        () => service.write('wrong.app'),
      ),
    ).rejects.toThrow('AUDIT_INVALID_EVENT');
    await expect(
      runtime.runBackground(
        trace,
        () => Promise.resolve(stored),
        async () => {
          throw new Error('worker failed');
        },
      ),
    ).rejects.toThrow('worker failed');
    expect(carrier.current()).toBeUndefined();
  });

  it('rejects actor/roles/secret/accessor background payloads before the verifier runs', async () => {
    let verified = 0;
    let reads = 0;
    const verify = (): Promise<TrustedAuditScope> => {
      verified++;
      return Promise.resolve(f.scope);
    };
    for (const extra of [
      { actor: { type: 'unknown' } },
      { roleIds: [] },
      { token: 'SYNTHETIC_SECRET' },
      { initiator: alice.actor },
    ]) {
      await expect(
        runtime.runBackground({ appId: f.scope.appId, ...extra }, verify, () =>
          service.write('forged'),
        ),
      ).rejects.toThrow('AUDIT_INVALID_EVENT');
    }
    await expect(
      runtime.runBackground(
        {
          appId: f.scope.appId,
          get operationId() {
            reads++;
            return 'forged';
          },
        },
        verify,
        () => service.write('getter'),
      ),
    ).rejects.toThrow('AUDIT_INVALID_EVENT');
    await expect(
      runtime.runBackground({ appId: 'other' }, verify, () =>
        service.write('other'),
      ),
    ).rejects.toThrow('AUDIT_INVALID_EVENT');
    expect(verified).toBe(0);
    expect(reads).toBe(0);
  });

  it('checks security scope again after verification and never copies queue hints over trusted IDs', async () => {
    const trace = { appId: f.scope.appId, operationId: 'forged-hint' };
    await expect(
      runtime.runBackground(
        trace,
        () => Promise.resolve({ ...f.scope, securityScope: 'other-tenant' }),
        () => service.write('wrong.tenant'),
      ),
    ).rejects.toThrow('AUDIT_INVALID_EVENT');
    await runtime.runBackground(
      trace,
      () =>
        Promise.resolve({
          ...f.scope,
          actor: { type: 'job', id: 'verified-worker' },
          initiator: alice.actor,
          operationId: 'server-job-operation',
        }),
      () => service.write('verified.ids'),
    );
    const rows = (await f.store.query(f.scope, { store: 'main' })).items;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      operationId: 'server-job-operation',
      actor: { type: 'job', id: 'verified-worker' },
      initiator: alice.actor,
    });
    expect(JSON.stringify(rows)).not.toContain('forged-hint');
  });
});
