import { Hono } from 'hono';
import { createI18nMiddleware } from '@nocobase/i18n/server';
import { createWorkflowI18nRuntime } from './i18n.js';
import locales from '../server/locales/index.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { QueueSchemaService } from '@boringnode/queue';
import { createQueueManager, type NocoBaseQueueManager } from '@nocobase/queue';
import { createMigrator, databaseManagerToken } from '@nocobase/db';
import { defineApiRoutes } from '@nocobase/app-server/router';
import {
  bindAuditRecorder,
  PortableAuditStore,
  TrustedAuditRuntime,
} from '@nocobase/app-plugin-audit/server';
import { authenticationAuditToken } from '@nocobase/app-plugin-authentication/server/audit';
import {
  createAuditAuthApp,
  jsonRequest,
} from '../../app-plugin-authentication/server/tests/helpers/audit-app.js';
import {
  buildWorkflowArtifact,
  writeWorkflowArtifact,
} from '../build/artifact-builder.js';
import { WorkflowService } from '../server/service.js';
import { internalWorkflowServiceToken } from '../server/tokens.js';
import { workflowAuditToken } from '../server/audit.js';
import { attachWorkflowAudit } from '../server/audit-internal.js';
import { apiRoutes } from '../server/routes/index.js';
import { auditDialects } from './audit-fixture.js';
import { waitFor } from './helpers.js';

for (const dialect of auditDialects)
  describe('workflow audit HTTP ' + dialect, () => {
    it('uses the production route and database queue for 202 then a correlated terminal fact', async () => {
      const root = await mkdtemp(join(tmpdir(), 'audit-workflow-http-'));
      let queue!: NocoBaseQueueManager;
      let service!: WorkflowService;
      let resumeWorker!: () => Promise<void>;
      let restoreGate: () => void = () => undefined;
      let workerLoop: Promise<void> | undefined;
      const a = await createAuditAuthApp(dialect, async (app) => {
        const database = app.container.resolve(databaseManagerToken);
        const store = new PortableAuditStore(database.connection(), {
          appId: 'synthetic-app',
          store: 'main',
        });
        await store.prepare();
        const authBridge = app.container.resolve(authenticationAuditToken);
        if (!(authBridge.runtime instanceof TrustedAuditRuntime))
          throw new Error('Expected real runtime');
        const bridge = {
          runtime: authBridge.runtime,
          collector: authBridge.collector,
          service: {
            bind: (
              scope: Parameters<typeof bindAuditRecorder>[0],
              options: { producer: string },
            ) =>
              bindAuditRecorder(scope, {
                producer: options.producer,
                store,
                policy: async () => ({
                  enabled: true,
                  revision: 1,
                  maxDetailsBytes: 16384,
                }),
              }),
            http: authBridge.collector.http.bind(authBridge.collector),
          },
        };
        app.container.instance(workflowAuditToken, bridge);
        attachWorkflowAudit(database, () => bridge);
        await createMigrator({
          database,
          directory: new URL('../database/migrations', import.meta.url)
            .pathname,
          packageName: '@nocobase/app-plugin-workflow',
        }).latest();
        const client = await database
          .connection()
          .client<import('knex').Knex>();
        const schema = new QueueSchemaService(client);
        await schema.createJobsTable('workflow_jobs');
        await schema.createSchedulesTable('workflow_schedules');
        queue = createQueueManager(
          {
            default: 'database',
            connections: {
              database: {
                driver: 'database',
                table: 'workflow_jobs',
                schedulesTable: 'workflow_schedules',
              },
            },
            worker: { concurrency: 1, idleDelay: '10ms' },
            jobs: { autoLoad: false, locations: [] },
          },
          { database },
        );
        const originalWorker = queue.createWorker.bind(queue);
        const pausedWorkers: ReturnType<typeof originalWorker>[] = [];
        const gate = vi
          .spyOn(queue, 'createWorker')
          .mockImplementation((options) => {
            const worker = originalWorker(options);
            pausedWorkers.push(worker);
            return {
              id: worker.id,
              start: async () => undefined,
              stop: () => worker.stop(),
            };
          });
        service = new WorkflowService({
          database,
          queue,
          queueName: 'workflow-http',
          distRoot: join(root, 'dist'),
          artifactDisk: {
            driver: 'fs',
            location: join(root, 'store'),
            visibility: 'private',
          },
          production: true,
        });
        restoreGate = () => gate.mockRestore();
        resumeWorker = async () => {
          gate.mockRestore();
          workerLoop = pausedWorkers[0].start(['workflow-http']);
        };
        app.container.instance(internalWorkflowServiceToken, service);
        const i18n = await createWorkflowI18nRuntime(locales);
        app.addRoutes(
          defineApiRoutes(async () => {
            const router = new Hono();
            router.use('*', createI18nMiddleware(i18n));
            router.route(
              '/',
              await apiRoutes.createRouter({
                appName: 'synthetic-app',
                publicBasePath: '',
                config: app.config,
                paths: app.paths,
                router,
                container: app.container,
              }),
            );
            return router;
          }),
        );
      });
      const client = await a.fixture.connection.client<import('knex').Knex>();
      try {
        const built = buildWorkflowArtifact({
          key: 'http-flow',
          flatIr: {
            title: 'HTTP flow',
            inputSchema: {
              type: 'object',
              properties: { password: { type: 'string' } },
            },
            parameters: {},
            start: 'run',
            nodes: [
              {
                key: 'run',
                title: 'Run',
                type: 'run',
                config: { module: './server/run' },
                upstreamKey: null,
                downstreamKey: null,
                branchKey: null,
              },
            ],
          },
          resourceFiles: new Map([
            [
              'server/run.js',
              'export async function run() { await new Promise(resolve => setTimeout(resolve, 100)); return 17; }',
            ],
          ]),
        });
        await writeWorkflowArtifact(built, join(root, 'dist'));
        const signup = await a.request(
          '/auth/sign-up/email',
          jsonRequest({
            email: 'workflow@example.com',
            username: 'workflow',
            name: 'Workflow',
            password: 'WORKFLOW_PASSWORD_SENTINEL_xxxxxxxxx',
          }),
        );
        expect(signup.status).toBe(200);
        const cookie = signup.headers.get('set-cookie')!;
        const path = '/workflows/' + built.digest + '/run';
        expect(
          (await a.request(path + '?enqueue=true', jsonRequest({ input: {} })))
            .status,
        ).toBe(401);
        const accepted = await a.request(
          path + '?enqueue=true',
          jsonRequest({ input: { password: 'WORKFLOW_INPUT_SECRET' } }, cookie),
        );
        expect(accepted.status).toBe(202);
        const payload = (await accepted.json()) as {
          data: { id: string; status: number | null };
        };
        expect(payload.data.status).toBeNull();
        expect(JSON.stringify(payload)).not.toContain('auditContext');
        const before = await a.events();
        const request = before.find(
          (event) =>
            event.action === 'workflow.run' && event.outcome === 'accepted',
        );
        expect(request).toBeDefined();
        expect(
          before.filter((event) => event.action === 'workflow.completed'),
        ).toHaveLength(0);
        const queued = await client('workflow_jobs')
          .count({ count: '*' })
          .first();
        expect(Number(queued?.count)).toBe(1);
        await resumeWorker();
        await waitFor(async () =>
          (await a.events()).some(
            (event) => event.action === 'workflow.completed',
          ),
        );
        const terminal = (await a.events()).find(
          (event) => event.action === 'workflow.completed',
        );
        expect(terminal?.outcome).toBe('success');
        expect(terminal?.runId).toBe(payload.data.id);
        expect(request?.runId).toBe(payload.data.id);
        expect(terminal?.operationId).toBe(request?.operationId);
        expect(terminal?.correlationId).toBe(request?.correlationId);
        expect(terminal?.actor.type).toBe('workflow');
        expect(terminal?.initiator?.type).toBe('user');
        expect(JSON.stringify(await a.events())).not.toContain(
          'WORKFLOW_INPUT_SECRET',
        );
        expect(
          (
            await a.request(
              path + '?enqueue=invalid',
              jsonRequest({ input: {} }, cookie),
            )
          ).status,
        ).toBe(400);
        expect(
          (await a.request(path, jsonRequest({ input: {} }, cookie))).status,
        ).toBe(200);
        expect(
          (
            await a.request(
              path + '?enqueue=false',
              jsonRequest({ input: {} }, cookie),
            )
          ).status,
        ).toBe(200);
        const publish = queue.dispatch.bind(queue);
        const early = vi
          .spyOn(queue, 'dispatch')
          .mockImplementation(async (...args) => {
            const result = await publish(...args);
            const payload = args[1] as { executionId: string };
            await waitFor(
              async () =>
                (await a.fixture.manager
                  .query()
                  .selectFrom('workflowRuns')
                  .where('id', '=', payload.executionId)
                  .value('status')) === 0,
            );
            return result;
          });
        const running = await a.request(
          path + '?enqueue=true',
          jsonRequest({ input: {} }, cookie),
        );
        early.mockRestore();
        expect(running.status).toBe(202);
        const runningBody = (await running.json()) as {
          data: { id: string; status: number };
        };
        expect(runningBody.data.status).toBe(0);
        await waitFor(
          async () =>
            (await a.fixture.manager
              .query()
              .selectFrom('workflowRuns')
              .where('id', '=', runningBody.data.id)
              .value('status')) === 1,
        );
        const fast = vi
          .spyOn(queue, 'dispatch')
          .mockImplementation(async (...args) => {
            const result = await publish(...args);
            const payload = args[1] as { executionId: string };
            await waitFor(
              async () =>
                (await a.fixture.manager
                  .query()
                  .selectFrom('workflowRuns')
                  .where('id', '=', payload.executionId)
                  .value('status')) === 1,
            );
            return result;
          });
        const completedBeforeResponse = await a.request(
          path + '?enqueue=true',
          jsonRequest({ input: {} }, cookie),
        );
        fast.mockRestore();
        expect(completedBeforeResponse.status).toBe(200);
        const failed = (await a.events()).filter(
          (event) =>
            event.action === 'workflow.run' && event.outcome === 'failed',
        );
        expect(failed.length).toBeGreaterThanOrEqual(1);
        const denied = (await a.events()).filter(
          (event) =>
            event.action === 'workflow.run' && event.outcome === 'denied',
        );
        expect(denied).toHaveLength(1);
      } finally {
        restoreGate();
        await service.dispose();
        await queue.close();
        await workerLoop;
        await a.close();
        await rm(root, { recursive: true, force: true });
      }
    });
  });
