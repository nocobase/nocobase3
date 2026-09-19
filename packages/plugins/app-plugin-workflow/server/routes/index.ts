import { databaseManagerToken } from '@nocobase/db';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { AppServiceError } from '../errors.js';
import { WorkflowInvocationError } from '../engine/index.js';
import type { WorkflowProviderConfig } from '../provider.js';
import { internalWorkflowServiceToken } from '../tokens.js';
import { translateWorkflowMessage } from '../i18n.js';
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
      const key =
        error.status === 409
          ? 'errors.conflict'
          : error.status === 503
            ? 'errors.serviceUnavailable'
            : 'errors.badRequest';
      return context.json(
        { message: translateWorkflowMessage(context, key, error.message) },
        error.status,
      );
    }
    if (error instanceof WorkflowInvocationError) {
      const key =
        error.code === 'WORKFLOW_NOT_FOUND'
          ? 'errors.workflowNotFound'
          : error.code === 'INVALID_INPUT'
            ? 'errors.invalidInput'
            : error.code === 'PARENT_RUN_NOT_FOUND'
              ? 'errors.parentRunNotFound'
              : error.code === 'STACK_LIMIT_EXCEEDED'
                ? 'errors.stackLimitExceeded'
                : error.code === 'INPUT_TOO_LARGE'
                  ? 'errors.inputTooLarge'
                  : 'errors.badRequest';
      return context.json(
        {
          message: translateWorkflowMessage(context, key, error.message),
          code: error.code,
        },
        400,
      );
    }
    return context.json(
      {
        message: translateWorkflowMessage(
          context,
          'errors.internal',
          'Internal server error.',
        ),
      },
      500,
    );
  });
  const authentication = container.resolve(authenticationToken);
  for (const path of workflowRoutePaths) {
    router.use(path, authentication.required());
  }
  if (
    container.has(databaseManagerToken) &&
    container.has(internalWorkflowServiceToken)
  ) {
    router.route(
      '/',
      createWorkflowRoutes(
        container.resolve(databaseManagerToken),
        container.resolve(internalWorkflowServiceToken),
      ),
    );
  } else {
    for (const path of workflowRoutePaths) {
      router.all(path, (context) =>
        context.json(
          {
            message: translateWorkflowMessage(
              context,
              'errors.notConfigured',
              'Workflow service is not configured.',
            ),
          },
          503,
        ),
      );
    }
  }
  return router;
});

const routes: readonly AppApiRouteContribution<
  AppPluginApplication<WorkflowProviderConfig>
>[] = [apiRoutes];

export default routes;
