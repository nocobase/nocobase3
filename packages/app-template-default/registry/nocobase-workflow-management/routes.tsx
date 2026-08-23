import { defineAppRoutes } from '@nocobase/portal-sdk/routing';
import { Navigate } from 'react-router';

export const workflowManagementRoutes = defineAppRoutes([
  { name: 'workflow', path: 'workflow', resource: { meta: { label: 'Workflow' } }, children: [
    { name: 'workflow.index', index: true, element: <Navigate to="workflows" replace /> },
    { name: 'workflow.workflows', path: 'workflows', outlet: 'manual', resource: { meta: { label: 'Workflows', parent: 'workflow' } }, lazy: () => import('./pages').then(({ WorkflowListPage }) => ({ default: WorkflowListPage })), children: [
      { name: 'workflow.workflow-detail', path: ':workflowId', resourceAction: 'show', lazy: () => import('./pages').then(({ WorkflowDetailPage }) => ({ default: WorkflowDetailPage })) },
    ] },
    { name: 'workflow.runs', path: 'runs', outlet: 'manual', resource: { meta: { label: 'Execution records', parent: 'workflow' } }, lazy: () => import('./pages').then(({ WorkflowRunListPage }) => ({ default: WorkflowRunListPage })), children: [
      { name: 'workflow.run-detail', path: ':runId', resourceAction: 'show', lazy: () => import('./pages').then(({ WorkflowRunDetailPage }) => ({ default: WorkflowRunDetailPage })) },
    ] },
  ] },
]);
