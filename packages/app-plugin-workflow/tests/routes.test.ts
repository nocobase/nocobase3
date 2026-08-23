import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import registerWorkflowRoutes from '../server/routes/api/workflows.js';
import type { WorkflowService } from '../server/services/workflow.js';

describe('@nocobase/app-plugin-workflow routes', () => {
  it('registers the protected workflow API routes', async () => {
    const app = new Hono();
    const workflow = createWorkflowService();

    registerWorkflowRoutes({
      app,
      deps: {
        auth: {
          required: () => async (_context, next) => next(),
        },
      },
      services: { plugins: { workflow } },
    });

    const response = await app.request('/api/workflows');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });
  });
});

function createWorkflowService(): WorkflowService {
  return {
    list: vi.fn().mockResolvedValue([]),
    enable: vi.fn(),
    disable: vi.fn(),
    setStatus: vi.fn(),
    getInputs: vi.fn(),
    updateInputs: vi.fn(),
    runs: vi.fn(),
    runsForWorkflow: vi.fn(),
    getWorkflow: vi.fn(),
    revisions: vi.fn(),
    getRun: vi.fn(),
    nodeRuns: vi.fn(),
    nodeRunPayload: vi.fn(),
    trigger: vi.fn(),
    run: vi.fn(),
  };
}
