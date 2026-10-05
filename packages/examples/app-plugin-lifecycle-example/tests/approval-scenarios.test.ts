// The interactive lab uses actual SQLite collections, production routes and
// repository transactions; the focused scenario tests retain their fake clock.
import path from 'node:path';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import { createAppPaths } from '@nocobase/app-server/config';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  createRepositoryLifecycleStore,
  LifecycleRuntime,
} from '@nocobase/lifecycle';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APPROVAL_DEMOS } from '../shared/approval-lab.js';
import { createApprovalLabStore } from '../server/approval-lab/store.js';
import { ApprovalLabService } from '../server/approval-lab/service.js';
import { approvalLabRoutes } from '../server/routes/approval-lab.js';
import { approvalLabServiceToken } from '../server/tokens.js';
import { LIFECYCLE_EXAMPLE_COLLECTIONS } from '../server/scope.js';

let database: DatabaseManager;
let service: ApprovalLabService;

beforeEach(async () => {
  database = createDatabaseManager({
    drivers: { sqlite },
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  await database
    .createMigrator({
      directory: path.resolve(import.meta.dirname, '../database/migrations'),
      packageName: '@nocobase/app-plugin-lifecycle-example',
    })
    .latest();
  service = lab();
  await service.start();
});
afterEach(async () => {
  await database.destroy();
});

function lab(): ApprovalLabService {
  const runtime = new LifecycleRuntime({
    store: createApprovalLabStore(
      createRepositoryLifecycleStore(database, {
        collections: {
          transitions: LIFECYCLE_EXAMPLE_COLLECTIONS.transitions,
          effectRuns: LIFECYCLE_EXAMPLE_COLLECTIONS.effectRuns,
        },
      }),
    ),
  });
  return new ApprovalLabService(database, runtime);
}

async function router(authorized = true): Promise<Hono> {
  const container = new ServiceContainer();
  container.instance(approvalLabServiceToken, service);
  container.instance(authenticationToken, {
    required: () =>
      authorized
        ? async (_context, next) => {
            await next();
          }
        : (context) => context.json({ code: 'UNAUTHORIZED' }, 401),
  } as Auth);
  const app: AppPluginApplication = {
    appName: 'main',
    publicBasePath: '',
    config: {} as never,
    paths: createAppPaths({ rootDir: '/missing' }),
    router: new Hono(),
    container,
  };
  return approvalLabRoutes.createRouter(app);
}

function post(url: string, body: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const base = '/lifecycle-example/approval-lab';

describe('interactive approval lab', () => {
  it('creates and starts every catalog scenario against the migrated schema', async () => {
    for (const demo of APPROVAL_DEMOS) {
      const created = await service.create(demo.key, {}, 'zhang');
      const transition =
        demo.lifecycle === 'coordinations'
          ? 'start'
          : demo.lifecycle === 'notices'
            ? 'publish'
            : demo.lifecycle === 'supplierOnboardings'
              ? 'legalApprove'
              : demo.lifecycle === 'orders'
                ? ''
                : 'submit';
      if (transition)
        await service.runtime.fire(demo.lifecycle, created.id, transition, {
          actor: {
            id: demo.lifecycle === 'supplierOnboardings' ? 'legalA' : 'zhang',
          },
        });
      expect(
        (
          await service.runtime.view(demo.lifecycle, created.id, {
            id: 'zhang',
          })
        ).history.transitions.length,
      ).toBeGreaterThan(0);
    }
    expect((await service.overview('admin')).records.length).toBeGreaterThan(
      APPROVAL_DEMOS.length,
    );
  });

  it('submits, returns, edits and resubmits a request, then completes its chain and keeps history after restart', async () => {
    const created = await service.create(
      'leaveTiered',
      { content: { days: 2 } },
      'zhang',
    );
    await service.runtime.fire('approvalRequests', created.id, 'submit', {
      actor: { id: 'zhang' },
    });
    expect((await service.overview('li')).todos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recordId: created.id, action: 'decide' }),
      ]),
    );
    await service.runtime.fire('approvalRequests', created.id, 'returnTo', {
      actor: { id: 'li' },
      input: { target: 'applicant', reason: 'Change dates' },
    });
    await service.runtime.fire('approvalRequests', created.id, 'editDraft', {
      actor: { id: 'zhang' },
      input: { content: { days: 5 } },
    });
    await service.runtime.fire('approvalRequests', created.id, 'submit', {
      actor: { id: 'zhang' },
    });
    for (const actor of ['li', 'wang', 'hr'])
      await service.runtime.fire('approvalRequests', created.id, 'decide', {
        actor: { id: actor },
        input: { decision: 'approve', comment: 'OK' },
      });
    const restarted = lab();
    await restarted.start();
    const view = await restarted.runtime.view('approvalRequests', created.id, {
      id: 'zhang',
    });
    expect(view.state).toBe('approved');
    expect(view.history.transitions.map((item) => item.transition)).toEqual([
      '$create',
      'submit',
      'returnTo',
      'editDraft',
      'submit',
      'decide',
      'decide',
      'decide',
    ]);
    expect((await restarted.overview('zhang')).messages.length).toBeGreaterThan(
      0,
    );
  });

  it('persists parallel children and concludes their parent only after both branches approve', async () => {
    const created = await service.create('purchase', {}, 'zhang');
    await service.runtime.fire('coordinations', created.id, 'start', {
      actor: { id: 'zhang' },
    });
    const first = await service.runtime.view('coordinations', created.id, {
      id: 'zhang',
    });
    const branches = first.record.branches as { id: string }[];
    expect(branches).toHaveLength(2);
    for (const [index, actor] of ['itA', 'facA'].entries())
      await service.runtime.fire(
        'approvalRequests',
        branches[index].id,
        'decide',
        { actor: { id: actor }, input: { decision: 'approve' } },
      );
    expect(
      (await service.runtime.view('coordinations', created.id, { id: 'zhang' }))
        .state,
    ).toBe('completed');
  });

  it('commits the approved grant with its request and refuses excess consumption', async () => {
    const created = await service.create('authorization', {}, 'zhang');
    await service.runtime.fire('authorizationRequests', created.id, 'submit', {
      actor: { id: 'zhang' },
    });
    await service.runtime.fire('authorizationRequests', created.id, 'approve', {
      actor: { id: 'li' },
      input: { limitCents: 20000 },
    });
    const request = await service.runtime.view(
      'authorizationRequests',
      created.id,
      { id: 'zhang' },
    );
    const grantId = String(request.record.grantId);
    const input = {
      amountCents: 10000,
      usageKey: 'one',
      subjectId: 'contract-42',
      subjectRevision: 1,
    };
    await service.runtime.fire('budgetGrants', grantId, 'consume', {
      actor: { id: 'zhang' },
      input,
    });
    await expect(
      service.runtime.fire('budgetGrants', grantId, 'consume', {
        actor: { id: 'zhang' },
        input: { ...input, usageKey: 'two', amountCents: 20000 },
      }),
    ).rejects.toMatchObject({ code: 'GUARD_REJECTED' });
    expect(
      (await service.runtime.view('budgetGrants', grantId, { id: 'zhang' }))
        .record.usedCents,
    ).toBe(10000);
  });

  it('completes notice confirmation and itemized reimbursement with durable external execution', async () => {
    const notice = await service.create('notice', {}, 'zhang');
    await service.runtime.fire('notices', notice.id, 'publish', {
      actor: { id: 'zhang' },
    });
    const copies = (await service.overview('li')).records.filter(
      (row) => row.lifecycle === 'acknowledgements',
    );
    for (const actor of ['li', 'wang']) {
      const items = (await service.overview(actor)).todos.filter(
        (item) => item.lifecycle === 'acknowledgements',
      );
      const id = items[0].recordId;
      await service.runtime.fire('acknowledgements', id, 'read', {
        actor: { id: actor },
      });
      await service.runtime.fire('acknowledgements', id, 'confirm', {
        actor: { id: actor },
      });
    }
    expect(copies).toHaveLength(2);
    expect(
      (await service.runtime.view('notices', notice.id, { id: 'zhang' })).state,
    ).toBe('effective');
    const reimbursement = await service.create('reimbursement', {}, 'zhang');
    await service.runtime.fire('reimbursements', reimbursement.id, 'submit', {
      actor: { id: 'zhang' },
    });
    for (const actor of ['finA', 'facA']) {
      const view = await service.runtime.view(
        'reimbursements',
        reimbursement.id,
        { id: actor },
      );
      const line = (
        view.record.lines as {
          id: string;
          approverId: string;
          contentHash: string;
        }[]
      ).find((item) => item.approverId === actor);
      await service.runtime.fire(
        'reimbursements',
        reimbursement.id,
        'decideLine',
        {
          actor: { id: actor },
          input: {
            lineId: line?.id,
            contentHash: line?.contentHash,
            outcome: 'approved',
          },
        },
      );
    }
    expect(
      (
        await service.runtime.view('reimbursements', reimbursement.id, {
          id: 'zhang',
        })
      ).state,
    ).toBe('paid');
    expect(
      (await service.overview('zhang')).operations.filter(
        (item) => item.kind === 'pay',
      ),
    ).toHaveLength(2);
  });

  it('authorizes routes, checks personas and rejects stale decisions while replaying an identical request', async () => {
    const unauthenticated = await router(false);
    for (const url of [
      'overview',
      'lifecycles/approvalRequests',
      'forms/approvalRequests/1',
    ])
      expect((await unauthenticated.request(`${base}/${url}`)).status).toBe(
        401,
      );
    const routes = await router();
    expect(
      (await routes.request(`${base}/overview?actAs=mallory`)).status,
    ).toBe(400);
    const created = await service.create('financePool', {}, 'zhang');
    await service.runtime.fire('approvalRequests', created.id, 'submit', {
      actor: { id: 'zhang' },
    });
    const view = await service.runtime.view('approvalRequests', created.id, {
      id: 'finA',
    });
    const url = `${base}/lifecycles/approvalRequests/${created.id}/fire?actAs=finA`;
    const values = {
      transition: 'claim',
      input: {},
      expectVersion: view.version,
      requestId: 'claim-click',
    };
    expect((await routes.request(post(url, values))).status).toBe(200);
    expect(
      (await routes.request(post(url, { ...values, requestId: 'stale-click' })))
        .status,
    ).toBe(409);
    expect(
      await (await routes.request(post(url, values))).json(),
    ).toMatchObject({ replayed: true });
    expect(
      (
        await routes.request(
          post(`${base}/events/orders/missing?actAs=zhang`, {
            transition: 'markReady',
            input: {},
            version: 0,
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await routes.request(
          post(
            `${base}/lifecycles/approvalRequests/${created.id}/runs/missing/retry?actAs=finA`,
            {},
          ),
        )
      ).status,
    ).toBe(403);
  });
  it('loads samples once and preserves already submitted sample requests', async () => {
    expect(await service.loadSamples('zhang')).toBe(APPROVAL_DEMOS.length);
    await service.runtime.fire('leaveRequests', 'sample:leave', 'submit', {
      actor: { id: 'zhang' },
    });
    expect(await service.loadSamples('admin')).toBe(0);
    expect(
      (
        await service.runtime.view('leaveRequests', 'sample:leave', {
          id: 'li',
        })
      ).state,
    ).toBe('pending');
    await expect(service.loadSamples('finA')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('rejects malformed forms and keeps lifecycle-owned fields out of create input', async () => {
    await expect(
      service.create('leaveTiered', { content: { days: 'five' } }, 'zhang'),
    ).rejects.toMatchObject({ code: 'INVALID' });
    await expect(
      service.create('notice', { recipientIds: {} }, 'zhang'),
    ).rejects.toMatchObject({ code: 'INVALID' });
    const order = await service.create(
      'order',
      { status: 'paid', paymentRef: 'injected', id: 'injected' },
      'zhang',
    );
    const view = await service.runtime.view('orders', order.id, {
      id: 'zhang',
    });
    expect(view.state).toBe('created');
    expect(view.record.paymentRef).toBeNull();
    expect(order.id).not.toBe('injected');
  });

  it('persists organization changes and new rule versions without changing an existing request plan', async () => {
    const old = await service.create('leaveVersioned', {}, 'zhang');
    await service.runtime.fire('approvalRequests', old.id, 'submit', {
      actor: { id: 'zhang' },
    });
    await expect(
      service.saveSettings({ versions: { leaveVersioned: 'v2' } }, 'zhang'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      service.saveSettings({ managers: { zhang: 'li', li: 'zhang' } }, 'admin'),
    ).rejects.toMatchObject({ code: 'INVALID' });
    await service.saveSettings(
      { managers: { zhang: 'zhao' }, versions: { leaveVersioned: 'v2' } },
      'admin',
    );
    const restarted = lab();
    await restarted.start();
    const fresh = await restarted.create('leaveVersioned', {}, 'zhang');
    await restarted.runtime.fire('approvalRequests', fresh.id, 'submit', {
      actor: { id: 'zhang' },
    });
    const previous = await restarted.runtime.view('approvalRequests', old.id, {
      id: 'li',
    });
    const next = await restarted.runtime.view('approvalRequests', fresh.id, {
      id: 'zhao',
    });
    expect(previous.record.ruleVersion).toBe('v1');
    expect(next.record.ruleVersion).toBe('v2');
    expect((await restarted.trail(previous.record)).stages).toHaveLength(2);
    expect((await restarted.trail(next.record)).stages).toHaveLength(3);
  });

  it('keeps a staged approval in its own tables, tied to the transitions, and writes them with the transition or not at all', async () => {
    const request = await service.create('leaveTiered', {}, 'zhang');
    await service.runtime.fire('approvalRequests', request.id, 'submit', {
      actor: { id: 'zhang' },
    });
    const tasks = database.repository('scenarioApprovalTasks');
    const logs = database.repository('scenarioApprovalLogs');
    expect(
      (await tasks.findMany({ filter: { requestId: request.id } })).map(
        (task) => [task.assigneeId, task.status],
      ),
    ).toEqual([['li', 'pending']]);
    const entries = await database
      .repository(LIFECYCLE_EXAMPLE_COLLECTIONS.transitions)
      .findMany({ filter: { recordId: request.id } });
    const submit = entries.find((entry) => entry.transition === 'submit');
    expect(
      (await logs.findMany({ filter: { requestId: request.id } })).every(
        (log) => log.transitionId === submit?.id,
      ),
    ).toBe(true);

    // The decision's next to-do takes a number something else already has:
    // the whole transition rolls back, the request and its rows included.
    const view = await service.runtime.view('approvalRequests', request.id, {
      id: 'li',
    });
    for (let step = 1; step <= 6; step += 1)
      await tasks.createOne({
        values: {
          id: `${request.id}:t${Number(view.record.sequence) + step}`,
          requestId: 'elsewhere',
          round: 1,
          seq: step,
          kind: 'decide',
          status: 'voided',
          assigneeId: 'nobody',
          via: 'plan',
          createdAt: new Date().toISOString(),
        },
      });
    await expect(
      service.runtime.fire('approvalRequests', request.id, 'decide', {
        actor: { id: 'li' },
        input: { decision: 'approve', comment: 'OK' },
      }),
    ).rejects.toThrow();
    const after = await service.trail(
      (await service.runtime.view('approvalRequests', request.id, { id: 'li' }))
        .record,
    );
    expect(after.stages.map((stage) => stage.status)).toEqual([
      'active',
      'pending',
      'pending',
    ]);
    expect(after.stages[0].tasks.map((task) => task.status)).toEqual([
      'pending',
    ]);
    expect(after.logs.every((log) => log.transitionId === submit?.id)).toBe(
      true,
    );
  });

  it('rolls back an approval when its related grant cannot be inserted', async () => {
    const request = await service.create('authorization', {}, 'zhang');
    await service.runtime.fire('authorizationRequests', request.id, 'submit', {
      actor: { id: 'zhang' },
    });
    await database.repository('scenarioBudgetGrants').createOne({
      values: {
        id: `grant-${request.id}`,
        status: 'revoked',
        statusChangedAt: new Date().toISOString(),
        lifecycleVersion: 1,
      },
    });
    await expect(
      service.runtime.fire('authorizationRequests', request.id, 'approve', {
        actor: { id: 'li' },
      }),
    ).rejects.toThrow();
    const view = await service.runtime.view(
      'authorizationRequests',
      request.id,
      { id: 'zhang' },
    );
    expect(view.state).toBe('pending');
    expect(view.record.grantId).toBeNull();
    expect(view.history.transitions.map((item) => item.transition)).toEqual([
      '$create',
      'submit',
    ]);
  });
});
