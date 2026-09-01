import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import type { WorkflowProviderConfig } from '../server/provider.js';
import { createNodeRunRoutes } from '../server/routes/node-runs.js';
import { apiRoutes } from '../server/routes/index.js';
import { createWorkflowRunRoutes } from '../server/routes/workflow-runs.js';
import { createWorkflowDefinitionRoutes } from '../server/routes/workflows.js';

describe('@nocobase/app-plugin-workflow routes', () => {
  it('registers the protected workflow API routes', async () => {
    const workflow = createWorkflowRepositories();
    const app = createTestApp(workflow);

    const response = await app.request('/api/workflows');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });
  });

  it('passes workflow filters and pagination to the service', async () => {
    const workflow = createWorkflowRepositories();
    const app = createTestApp(workflow);

    await app.request(
      '/api/workflows?q=approval&enabled=false&page=2&pageSize=10',
    );

    expect(workflow.workflows.list).toHaveBeenCalledWith({
      query: 'approval',
      enabled: false,
      page: 2,
      pageSize: 10,
    });
  });

  it('passes execution filters and pagination to the service', async () => {
    const workflow = createWorkflowRepositories();
    const app = createTestApp(workflow);

    await app.request(
      '/api/workflow-runs?workflowKey=leave&workflowTitle=Leave&status=-1&page=3&pageSize=5',
    );

    expect(workflow.workflowRuns.list).toHaveBeenCalledWith({
      workflowKey: 'leave',
      workflowTitle: 'Leave',
      status: -1,
      page: 3,
      pageSize: 5,
    });
  });

  it('passes the manual run event key through service options', async () => {
    const workflow = createWorkflowRepositories();
    vi.mocked(workflow.workflowRuns.run).mockResolvedValue({
      id: 'run-1',
      workflowId: 'definition-1',
      workflowKey: 'approval',
      workflowTitle: 'Approval',
      workflowVersion: 'version-1',
      eventKey: 'operator-request-42',
      status: null,
      startedAt: null,
      finishedAt: null,
      createdAt: '2026-08-26T00:00:00.000Z',
    });
    const app = createTestApp(workflow);

    const response = await app.request('/api/workflows/definition-1/run', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'event-key': 'operator-request-42',
      },
      body: JSON.stringify({ input: { amount: 100 } }),
    });

    expect(response.status).toBe(200);
    expect(workflow.workflowRuns.run).toHaveBeenCalledWith(
      'definition-1',
      { amount: 100 },
      { eventKey: 'operator-request-42' },
    );
  });

  it('enables a workflow by synchronized id or unsynchronized artifact hash', async () => {
    const workflow = createWorkflowRepositories();
    vi.mocked(workflow.workflows.enable).mockResolvedValue({
      id: 'definition-1',
      key: 'approval',
      title: 'Approval',
      enabled: true,
      current: true,
      hasParameters: false,
      executed: 0,
      version: 'version-1',
      hash: 'artifact-hash',
      activeRunCount: 0,
      latestRun: null,
    });
    const app = createTestApp(workflow);

    const response = await app.request('/api/workflows/artifact-hash/enable', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(workflow.workflows.enable).toHaveBeenCalledWith('artifact-hash');
  });

  it('does not apply its authentication boundary to later Route contributions', async () => {
    const application = new Hono();
    const pluginRouter = await apiRoutes.createRouter(
      createWorkflowApplication({
        required: () => (context) =>
          context.json({ code: 'UNAUTHORIZED' }, 401),
      } as unknown as Auth),
    );
    application.route('/api', pluginRouter);
    application.get('/api/later-plugin', (context) => context.text('later'));

    expect((await application.request('/api/workflows')).status).toBe(401);
    expect((await application.request('/api/workflow-runs/run-1')).status).toBe(
      401,
    );
    await expect(
      (await application.request('/api/later-plugin')).text(),
    ).resolves.toBe('later');
  });

  it('returns unavailable only after authentication succeeds', async () => {
    const router = await apiRoutes.createRouter(
      createWorkflowApplication({
        required: () => async (_context, next) => next(),
      } as unknown as Auth),
    );

    const response = await router.request('/workflows');

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      message: 'Workflow service is not configured.',
    });
  });

  it('returns validation errors using the standard error contract', async () => {
    const app = new Hono();
    const workflow = createWorkflowRepositories();
    registerTestRoutes(app, workflow);

    const response = await app.request('/api/workflows/definition-1/status', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: 'yes' }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'enabled must be a boolean',
    });
  });
});

interface TestRepositories {
  workflows: Parameters<typeof createWorkflowDefinitionRoutes>[0];
  workflowRuns: Parameters<typeof createWorkflowRunRoutes>[0] &
    Parameters<typeof createNodeRunRoutes>[0];
}

function createTestApp(repositories: TestRepositories): Hono {
  const app = new Hono();
  registerTestRoutes(app, repositories);
  return app;
}

function registerTestRoutes(app: Hono, repositories: TestRepositories): void {
  app.route('/api', createWorkflowDefinitionRoutes(repositories.workflows));
  app.route('/api', createWorkflowRunRoutes(repositories.workflowRuns));
  app.route('/api', createNodeRunRoutes(repositories.workflowRuns));
}

function createWorkflowApplication(
  authentication: Auth,
): AppPluginApplication<WorkflowProviderConfig> {
  const container = new ServiceContainer();
  container.instance(authenticationToken, authentication);
  return {
    appName: 'main',
    publicBasePath: '',
    config: {
      app: { publicBasePath: '' },
      drive: {
        default: 'private',
        disks: {
          private: {
            driver: 'fs',
            location: '/missing',
            visibility: 'private',
          },
        },
        links: {},
      },
      workflow: {
        sourceRoot: '/missing/source',
        distRoot: '/missing/dist',
        artifactDisk: 'private',
        production: false,
      },
    },
    paths: {} as never,
    router: new Hono(),
    container,
  };
}

function createWorkflowRepositories(): TestRepositories {
  return {
    workflows: {
      list: vi
        .fn()
        .mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 }),
      enable: vi.fn(),
      disable: vi.fn(),
      setStatus: vi.fn(),
      getParameters: vi.fn(),
      updateParameters: vi.fn(),
      get: vi.fn(),
      revisions: vi.fn(),
    },
    workflowRuns: {
      list: vi
        .fn()
        .mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 }),
      listForWorkflow: vi.fn(),
      get: vi.fn(),
      nodeRuns: vi.fn(),
      nodeRunPayload: vi.fn(),
      run: vi.fn(),
    },
  };
}
