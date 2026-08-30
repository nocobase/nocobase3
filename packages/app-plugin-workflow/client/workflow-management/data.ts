import type {
  WorkflowDetailRecord,
  WorkflowListRecord,
  WorkflowNodeRunPayload,
  WorkflowNodeRunRecord,
  WorkflowRunRecord,
} from './types.js';
import { getWorkflowClient } from './runtime.js';

interface DataResponse<T> {
  readonly data: T;
}

const pendingRequests = new Map<string, Promise<unknown>>();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET';
  const key = `${method}:${path}`;
  const pending = method === 'GET' ? pendingRequests.get(key) : undefined;
  if (pending) return (await pending) as T;
  const operation = getWorkflowClient()
    .request<DataResponse<T>>(path, init)
    .then((response) => {
      if (
        response === null ||
        typeof response !== 'object' ||
        !Object.hasOwn(response, 'data')
      ) {
        throw new Error('Workflow API returned an invalid response.');
      }
      return response.data;
    });
  if (method === 'GET') pendingRequests.set(key, operation);
  try {
    return await operation;
  } finally {
    if (pendingRequests.get(key) === operation) pendingRequests.delete(key);
  }
}
export const workflowApi = {
  workflows: (query: string = ''): Promise<WorkflowListRecord[]> =>
    request(`/workflows${query}`),
  workflow: (id: string): Promise<WorkflowDetailRecord> =>
    request(`/workflows/${encodeURIComponent(id)}`),
  revisions: (id: string): Promise<WorkflowDetailRecord[]> =>
    request(`/workflows/${encodeURIComponent(id)}/revisions`),
  runs: (query: string = ''): Promise<WorkflowRunRecord[]> =>
    request(`/workflow-runs${query}`),
  workflowRuns: (id: string): Promise<WorkflowRunRecord[]> =>
    request(`/workflows/${encodeURIComponent(id)}/runs`),
  run: (id: string): Promise<WorkflowRunRecord> =>
    request(`/workflow-runs/${encodeURIComponent(id)}`),
  nodeRuns: (id: string, nodeKey?: string): Promise<WorkflowNodeRunRecord[]> =>
    request(
      `/workflow-runs/${encodeURIComponent(id)}/node-runs${nodeKey ? `?nodeKey=${encodeURIComponent(nodeKey)}` : ''}`,
    ),
  payload: (
    runId: string,
    nodeRunId: string,
  ): Promise<WorkflowNodeRunPayload> =>
    request(
      `/workflow-runs/${encodeURIComponent(runId)}/node-runs/${encodeURIComponent(nodeRunId)}/payload`,
    ),
  status: (id: string, enabled: boolean): Promise<WorkflowListRecord> =>
    request(`/workflows/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),
  enable: (idOrHash: string): Promise<WorkflowListRecord> =>
    request(`/workflows/${encodeURIComponent(idOrHash)}/enable`, {
      method: 'POST',
    }),
  parameters: (
    id: string,
    parameterValues: Record<string, string | number | boolean>,
  ): Promise<object> =>
    request(`/workflows/${encodeURIComponent(id)}/parameters`, {
      method: 'PUT',
      body: JSON.stringify({ parameterValues }),
    }),
  execute: (
    id: string,
    input: object,
    eventKey: string,
  ): Promise<WorkflowRunRecord> =>
    request(`/workflows/${encodeURIComponent(id)}/run`, {
      method: 'POST',
      headers: { 'event-key': eventKey },
      body: JSON.stringify({ input }),
    }),
};

export function shouldPollRuns(runs: readonly WorkflowRunRecord[]): boolean {
  return runs.some((run) => run.status == null || run.status === 0);
}

export function createWorkflowEventKey(
  randomUUID: (() => string) | null = globalThis.crypto?.randomUUID?.bind(
    globalThis.crypto,
  ) ?? null,
): string {
  return (
    randomUUID?.() ??
    `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}
