import type { AppPluginRoutesContext } from '@nocobase/app-server-kit/plugins';
import { Hono } from 'hono';

import {
  getRuntimeWorkflow,
  type AppWorkflowRuntime,
} from '../runtime/runtime.js';
import { AppServiceError } from '../services/errors.js';
import { WorkflowRepository } from '../services/workflow-repository.js';
import { WorkflowRunRepository } from '../services/workflow-run-repository.js';
import { createNodeRunRoutes } from './node-runs.js';
import { createWorkflowRunRoutes } from './workflow-runs.js';
import { createWorkflowDefinitionRoutes } from './workflows.js';
import type {
  WorkflowPluginRouteDeps,
  WorkflowPluginRoutesContext,
  WorkflowPluginRouteServices,
} from './types.js';

export function createWorkflowRoutes(
  database: NonNullable<
    WorkflowPluginRoutesContext['deps']['runtime']['database']
  >,
  runtime: AppWorkflowRuntime,
): Hono {
  const workflows = new WorkflowRepository(database, runtime);
  const workflowRuns = new WorkflowRunRepository(database, runtime);
  const routes = new Hono();
  routes.route('/', createWorkflowDefinitionRoutes(workflows));
  routes.route('/', createWorkflowRunRoutes(workflowRuns));
  routes.route('/', createNodeRunRoutes(workflowRuns));
  return routes;
}

export default function registerWorkflowRoutes({
  app,
  deps,
}: WorkflowPluginRoutesContext): void {
  const protectedRoutes = new Hono();
  protectedRoutes.onError((error, context) => {
    if (error instanceof AppServiceError) {
      return context.json({ error: error.message }, error.status);
    }
    return context.json({ error: 'Internal server error.' }, 500);
  });
  protectedRoutes.use('*', deps.auth.required());
  const workflowRuntime = getRuntimeWorkflow(deps.runtime);
  if (deps.runtime.database && workflowRuntime) {
    protectedRoutes.route(
      '/',
      createWorkflowRoutes(deps.runtime.database, workflowRuntime),
    );
  } else {
    protectedRoutes.all('*', (context) =>
      context.json({ error: 'Workflow runtime is not configured.' }, 503),
    );
  }
  app.route('/api', protectedRoutes);
}

export type {
  AppPluginRoutesContext,
  WorkflowPluginRouteDeps,
  WorkflowPluginRouteServices,
};
