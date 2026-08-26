import type { WorkflowDetailRecord, WorkflowListRecord, WorkflowNodeRunPayload, WorkflowNodeRunRecord, WorkflowRunRecord } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } }); const body = await response.json() as { data?: T; error?: string }; if (!response.ok || body.data === undefined) throw new Error(body.error ?? `Request failed (${response.status})`); return body.data; }
export const workflowApi = {
  workflows: (query: string = ''): Promise<WorkflowListRecord[]> => request(`/workflows${query}`),
  workflow: (id: string): Promise<WorkflowDetailRecord> => request(`/workflows/${encodeURIComponent(id)}`),
  revisions: (id: string): Promise<WorkflowDetailRecord[]> => request(`/workflows/${encodeURIComponent(id)}/revisions`),
  runs: (query: string = ''): Promise<WorkflowRunRecord[]> => request(`/workflow-runs${query}`),
  workflowRuns: (id: string): Promise<WorkflowRunRecord[]> => request(`/workflows/${encodeURIComponent(id)}/runs`),
  run: (id: string): Promise<WorkflowRunRecord> => request(`/workflow-runs/${encodeURIComponent(id)}`),
  nodeRuns: (id: string, nodeKey?: string): Promise<WorkflowNodeRunRecord[]> => request(`/workflow-runs/${encodeURIComponent(id)}/node-runs${nodeKey ? `?nodeKey=${encodeURIComponent(nodeKey)}` : ''}`),
  payload: (runId: string, nodeRunId: string): Promise<WorkflowNodeRunPayload> => request(`/workflow-runs/${encodeURIComponent(runId)}/node-runs/${encodeURIComponent(nodeRunId)}/payload`),
  status: (id: string, enabled: boolean): Promise<WorkflowListRecord> => request(`/workflows/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  inputs: (id: string, inputValues: Record<string, string | number | boolean>): Promise<object> => request(`/workflows/${encodeURIComponent(id)}/input-values`, { method: 'PUT', body: JSON.stringify({ inputValues }) }),
  execute: (id: string, context: object, eventKey: string): Promise<WorkflowRunRecord> => request(`/workflows/${encodeURIComponent(id)}/run`, { method: 'POST', headers: { 'event-key': eventKey }, body: JSON.stringify({ context }) }),
};

export function shouldPollRuns(runs: readonly WorkflowRunRecord[]): boolean { return runs.some((run) => run.status == null || run.status === 0); }
