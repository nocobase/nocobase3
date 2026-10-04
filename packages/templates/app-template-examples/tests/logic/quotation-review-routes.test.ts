// @vitest-environment node
import path from 'node:path';
import { type DatabaseManager, databaseManagerToken } from '@nocobase/db';
import {
  createTestDatabase,
  type TestDatabase,
} from '@nocobase/app-testing/server';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  workflowServiceToken,
  type WorkflowServiceApi,
} from '@nocobase/app-plugin-workflow/server';
import type { Application } from '@nocobase/app-server/application';
import {
  ServiceContainer,
  type ServiceToken,
} from '@nocobase/service-provider';
import { type Hono, type MiddlewareHandler } from 'hono';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { quotationReviewTaskRoutes } from '../../server/routes/quotation-review-tasks.ts';

let database: DatabaseManager;
let testDatabase: TestDatabase;
let router: Hono;
let id: number;
const getRequest = vi.fn();
const getPending = vi.fn();
beforeEach(async () => {
  getRequest.mockReset().mockResolvedValue({ status: 'queued', reason: null });
  getPending
    .mockReset()
    .mockResolvedValue({ status: 'pending', correlation: null });
  testDatabase = await createTestDatabase();
  database = testDatabase.database;
  await database
    .createMigrator({
      packageName: 'review-routes',
      directory: path.resolve(
        import.meta.dirname,
        '../../database/main/migrations',
      ),
    })
    .latest();
  const row = await database.repository('quotationReviewTasks').createOne({
    values: {
      runId: '42',
      quotationId: 'Q-100',
      totalCents: 50000,
      route: 'standard',
      status: 'submitted',
      resumeRequestId: '12345',
      createdAt: new Date(),
      decision: 'approved',
      reviewerId: 'alice',
      confirmedBy: 'Alice',
      comment: 'Checked',
    },
  });
  id = Number(row.record.id);
  const container = new ServiceContainer();
  container.instance(databaseManagerToken, database);
  const required = (): MiddlewareHandler => async (c, next) => {
    if (!c.req.header('x-test-user'))
      return c.json({ code: 'UNAUTHENTICATED' }, 401);
    c.set('auth', { user: { id: 'alice', name: 'Alice' } });
    await next();
  };
  container.instance(authenticationToken, {
    required,
  } as unknown as typeof authenticationToken extends ServiceToken<infer T>
    ? T
    : never);
  container.instance(workflowServiceToken, {
    getInstructionApi: () => ({ getRequest, getPending }),
  } as unknown as WorkflowServiceApi);
  router = await quotationReviewTaskRoutes.createRouter({
    container,
  } as Application);
});
afterEach(async () => {
  await testDatabase.destroy();
});

it.each([
  { status: 'queued', reason: null },
  { status: 'processing', reason: null },
  { status: 'consumed', reason: null },
  { status: 'rejected', reason: 'run-ended' },
  { status: 'rejected', reason: 'stale' },
  { status: 'rejected', reason: 'commit-failed' },
  { status: 'not-found' },
])(
  'reports the recorded outcome $status ($reason) on list and detail',
  async (outcome) => {
    getRequest.mockResolvedValue(outcome);
    for (const url of [
      '/quotation-review-tasks',
      `/quotation-review-tasks/${id}`,
    ]) {
      const response = await router.request(url, {
        headers: { 'x-test-user': 'alice' },
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { data: unknown };
      expect(Array.isArray(body.data) ? body.data[0] : body.data).toMatchObject(
        {
          resumeRequestId: '12345',
          resumeRequest: outcome,
        },
      );
    }
    expect(getRequest).toHaveBeenCalledWith('12345');
  },
);

it('keeps historical decisions readable without inventing a successful outcome', async () => {
  await database.repository('quotationReviewTasks').updateOne({
    filter: { id },
    values: { resumeRequestId: null },
  });
  const response = await router.request(`/quotation-review-tasks/${id}`, {
    headers: { 'x-test-user': 'alice' },
  });
  expect(await response.json()).toMatchObject({
    data: { resumeRequest: null },
  });
  expect(getRequest).not.toHaveBeenCalled();
});

it('requires authentication to read submission outcomes', async () => {
  expect((await router.request(`/quotation-review-tasks/${id}`)).status).toBe(
    401,
  );
  expect(getRequest).not.toHaveBeenCalled();
});
