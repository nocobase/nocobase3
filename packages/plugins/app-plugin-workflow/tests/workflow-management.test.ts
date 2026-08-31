import { describe, expect, it, vi } from 'vitest';

import {
  createWorkflowEventKey,
  shouldPollRuns,
  workflowApi,
} from '../client/workflow-management/data.js';
import { createLayoutCacheKey } from '../client/workflow-management/graph/layout-cache.js';
import { configureWorkflowClient } from '../client/workflow-management/runtime.js';

describe('workflow management', () => {
  it('scopes the layout cache to the definition', () => {
    expect(
      createLayoutCacheKey({
        workflowId: '1',
        hash: 'v7',
        direction: 'RIGHT',
        dimensions: '220x80',
      }),
    ).toBe('1:v7:RIGHT:220x80:1');
  });

  it('polls only non-terminal runs', () => {
    expect(
      shouldPollRuns([
        {
          id: '1',
          workflowId: '1',
          workflowKey: 'x',
          eventKey: 'e',
          status: 0,
          createdAt: '',
        },
      ]),
    ).toBe(true);
    expect(
      shouldPollRuns([
        {
          id: '1',
          workflowId: '1',
          workflowKey: 'x',
          eventKey: 'e',
          status: 1,
          createdAt: '',
        },
      ]),
    ).toBe(false);
  });

  it('uses the application client for workflow API requests', async () => {
    const request = vi.fn().mockResolvedValue({ data: { id: 'run-1' } });
    configureWorkflowClient({ request });

    await expect(
      workflowApi.execute('workflow-1', { approved: true }, 'event-1'),
    ).resolves.toEqual({ id: 'run-1' });
    expect(request).toHaveBeenCalledWith('/workflows/workflow-1/run', {
      body: JSON.stringify({ input: { approved: true } }),
      headers: { 'event-key': 'event-1' },
      method: 'POST',
    });
  });

  it('deduplicates concurrent workflow reads', async () => {
    let resolveRequest: ((value: { data: [] }) => void) | undefined;
    const request = vi.fn(
      () =>
        new Promise<{ data: [] }>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    configureWorkflowClient({ request });

    const first = workflowApi.workflows();
    const second = workflowApi.workflows();
    expect(request).toHaveBeenCalledOnce();
    resolveRequest?.({ data: [] });
    await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
  });

  it('creates an event key when randomUUID is unavailable', () => {
    expect(createWorkflowEventKey(() => 'event-1')).toBe('event-1');
    expect(createWorkflowEventKey(null)).toMatch(/^manual-[a-z0-9]+-/);
  });
});
