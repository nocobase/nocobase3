import { databaseManagerToken } from '@nocobase/app-database';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server-kit/router';
import { Hono } from 'hono';

import { AppServiceError } from '../errors.js';
import { WorkflowInvocationError } from '../engine/index.js';
import type { WorkflowProviderConfig } from '../providers/workflow.js';
import { workflowServiceToken } from '../tokens.js';
import { createWorkflowRoutes } from './workflow.js';

const workflowRoutePaths = [
  '/workflows',
  '/workflows/*',
  '/workflow-runs',
  '/workflow-runs/*',
] as const;

export const apiRoutes: AppApiRouteContribution<
  AppPluginApplication<WorkflowProviderConfig>
> = defineApiRoutes(({ container }) => {
  const router = new Hono();
  router.onError((error, context) => {
    if (error instanceof AppServiceError) {
      return context.json({ message: error.message }, error.status);
    }
    if (error instanceof WorkflowInvocationError)
      return context.json({ message: error.message, code: error.code }, 400);
    return context.json({ message: 'Internal server error.' }, 500);
  });
  const authentication = container.resolve(authenticationToken);
  for (const path of workflowRoutePaths) {
    router.use(path, authentication.required());
  }
  if (
    container.has(databaseManagerToken) &&
    container.has(workflowServiceToken)
  ) {
    router.route(
      '/',
      createWorkflowRoutes(
        container.resolve(databaseManagerToken),
        container.resolve(workflowServiceToken),
      ),
    );
  } else {
    for (const path of workflowRoutePaths) {
      router.all(path, (context) =>
        context.json({ message: 'Workflow service is not configured.' }, 503),
      );
    }
  }
  return router;
});

const routes: readonly AppApiRouteContribution<
  AppPluginApplication<WorkflowProviderConfig>
>[] = [apiRoutes];

export default routes;
