import {
  databaseManagerToken,
  type DatabaseManager,
} from '@nocobase/app-database';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { Hono } from 'hono';
import type { ServiceContainer } from '@nocobase/service-provider';

import type { WorkflowService } from '../runtime/runtime.js';
import { AppServiceError } from '../errors.js';
import { WorkflowRepository } from '../repositories/workflow-repository.js';
import { WorkflowRunRepository } from '../repositories/workflow-run-repository.js';
import { workflowServiceToken } from '../token.js';
import { createNodeRunRoutes } from './node-runs.js';
import { createWorkflowRunRoutes } from './workflow-runs.js';
import { createWorkflowDefinitionRoutes } from './workflows.js';

export interface WorkflowPluginRoutesApplication {
  readonly container: ServiceContainer;
}

export function createWorkflowRoutes(
  database: DatabaseManager,
  service: WorkflowService,
): Hono {
  const workflows = new WorkflowRepository(database, service);
  const workflowRuns = new WorkflowRunRepository(database, service);
  const routes = new Hono();
  routes.route('/', createWorkflowDefinitionRoutes(workflows));
  routes.route('/', createWorkflowRunRoutes(workflowRuns));
  routes.route('/', createNodeRunRoutes(workflowRuns));
  return routes;
}

export default function registerWorkflowRoutes(
  { container }: WorkflowPluginRoutesApplication,
  router: Hono,
): void {
  const protectedRoutes = new Hono();
  protectedRoutes.onError((error, context) => {
    if (error instanceof AppServiceError) {
      return context.json({ error: error.message }, error.status);
    }
    return context.json({ error: 'Internal server error.' }, 500);
  });
  protectedRoutes.use('*', container.resolve(authenticationToken).required());
  if (
    container.has(databaseManagerToken) &&
    container.has(workflowServiceToken)
  ) {
    protectedRoutes.route(
      '/',
      createWorkflowRoutes(
        container.resolve(databaseManagerToken),
        container.resolve(workflowServiceToken),
      ),
    );
  } else {
    protectedRoutes.all('*', (context) =>
      context.json({ error: 'Workflow service is not configured.' }, 503),
    );
  }
  router.route('/', protectedRoutes);
}
