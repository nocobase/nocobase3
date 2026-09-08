import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { loggingToken } from '@nocobase/app-server/logging';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import type { Logger } from '@nocobase/logging';

import { HubError } from '../services/hub.js';
import {
  hubServiceToken,
  type CreateHubAppInput,
  type DeployHubAppInput,
  type RollbackHubAppInput,
  type UpdateHubConfigInput,
  type UpdateHubSettingsInput,
} from '../tokens.js';
import {
  appSummaryResponse,
  appDetailResponse,
  releaseResponse,
  deploymentResponse,
  deploymentListResponse,
} from './responses.js';

const MAX_ARTIFACT_SIZE = 256 * 1024 * 1024;

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const authentication = container.resolve(authenticationToken);
    const authorization = container.resolve(authorizationToken);
    const hub = container.resolve(hubServiceToken);
    const securityLogger = container.has(loggingToken)
      ? container.resolve(loggingToken).getLogger('security')
      : undefined;

    routes.use('*', authentication.required(), authorization.middleware());
    routes.onError((error, context) => {
      if (error instanceof AuthorizationDeniedError) {
        return context.json(
          { error: { code: 'FORBIDDEN', message: error.message } },
          403,
        );
      }
      throw error;
    });

    routes.get('/apps', async (context) => {
      await requireHubAction(context, '*', 'read');
      return respond(context, async () =>
        (await hub.listApps()).map(appSummaryResponse),
      );
    });
    routes.post('/apps', async (context) => {
      await requireHubAction(context, '*', 'create');
      const input = await context.req.json<CreateHubAppInput>();
      return await respond(context, async () => {
        const app = await hub.createApp(input);
        logSecurityEvent(securityLogger, context, 'hub.app.create', app.app.id);
        return { id: app.app.id };
      });
    });
    routes.get('/apps/:appId', async (context) => {
      await requireHubAction(context, context.req.param('appId'), 'read');
      return respond(context, async () =>
        appDetailResponse(await hub.getApp(context.req.param('appId'))),
      );
    });
    routes.get('/apps/:appId/releases', async (context) => {
      await requireHubAction(
        context,
        context.req.param('appId'),
        'read-release',
      );
      return respond(context, async () =>
        (await hub.listReleases(context.req.param('appId'))).map(
          releaseResponse,
        ),
      );
    });
    routes.get('/apps/:appId/releases/:releaseId', async (context) => {
      await requireHubAction(
        context,
        context.req.param('appId'),
        'read-release',
      );
      return respond(context, async () =>
        releaseResponse(
          await hub.getRelease(
            context.req.param('appId'),
            context.req.param('releaseId'),
          ),
        ),
      );
    });
    routes.get(
      '/apps/:appId/releases/:releaseId/config-template',
      async (context) => {
        await requireHubAction(
          context,
          context.req.param('appId'),
          'read-config-template',
        );
        preventSensitiveResponseCaching(context);
        return await respond(context, async () => ({
          content: (
            await hub.getRelease(
              context.req.param('appId'),
              context.req.param('releaseId'),
            )
          ).configTemplate,
        }));
      },
    );
    routes.post('/apps/:appId/releases', async (context) => {
      const appId = context.req.param('appId');
      await requireHubAction(context, appId, 'upload-release');
      return respond(context, async () => {
        const release = await hub.createRelease(appId, {
          bytes: await readBody(context.req.raw, MAX_ARTIFACT_SIZE),
        });
        logSecurityEvent(securityLogger, context, 'hub.release.upload', appId, {
          releaseId: release.id,
        });
        return releaseResponse(release);
      });
    });
    routes.get('/apps/:appId/config', async (context) => {
      await requireHubAction(
        context,
        context.req.param('appId'),
        'read-config',
      );
      preventSensitiveResponseCaching(context);
      return await respond(context, () =>
        hub.readConfig(context.req.param('appId')),
      );
    });
    routes.put('/apps/:appId/config', async (context) => {
      const appId = context.req.param('appId');
      await requireHubAction(context, appId, 'update-config');
      preventSensitiveResponseCaching(context);
      const input = await context.req.json<UpdateHubConfigInput>();
      return await respond(context, async () => {
        const result = await hub.updateConfig(appId, input);
        logSecurityEvent(securityLogger, context, 'hub.config.update', appId);
        return result;
      });
    });
    routes.put('/apps/:appId/settings', async (context) => {
      const appId = context.req.param('appId');
      await requireHubAction(context, appId, 'update-settings');
      const input = await context.req.json<UpdateHubSettingsInput>();
      return await respond(context, async () => {
        await hub.updateSettings(appId, input);
        logSecurityEvent(securityLogger, context, 'hub.settings.update', appId);
        return { success: true };
      });
    });
    routes.post('/apps/:appId/deploy', async (context) => {
      const appId = context.req.param('appId');
      await requireHubAction(context, appId, 'deploy');
      const input = await context.req.json<DeployHubAppInput>();
      return await respond(
        context,
        async () => {
          const deployment = await hub.deploy(appId, input);
          logSecurityEvent(securityLogger, context, 'hub.app.deploy', appId, {
            deploymentId: deployment.id,
          });
          return { id: deployment.id, status: deployment.status };
        },
        202,
      );
    });
    routes.get('/apps/:appId/deployments', async (context) => {
      await requireHubAction(
        context,
        context.req.param('appId'),
        'read-deployment',
      );
      return respond(context, async () => {
        const result = await hub.listDeployments(context.req.param('appId'), {
          page: Number(context.req.query('page') ?? 1),
          pageSize: Number(context.req.query('pageSize') ?? 20),
        });
        return { ...result, items: result.items.map(deploymentListResponse) };
      });
    });
    routes.get('/apps/:appId/deployments/:deploymentId', async (context) => {
      await requireHubAction(
        context,
        context.req.param('appId'),
        'read-deployment',
      );
      return respond(context, async () =>
        deploymentResponse(
          await hub.getDeployment(
            context.req.param('appId'),
            context.req.param('deploymentId'),
          ),
        ),
      );
    });
    routes.post('/apps/:appId/rollback', async (context) => {
      const appId = context.req.param('appId');
      await requireHubAction(context, appId, 'rollback');
      const input = await context.req.json<RollbackHubAppInput>();
      return await respond(
        context,
        async () => {
          const deployment = await hub.rollback(appId, input);
          logSecurityEvent(securityLogger, context, 'hub.app.rollback', appId, {
            deploymentId: deployment.id,
          });
          return { id: deployment.id, status: deployment.status };
        },
        202,
      );
    });
    routes.post('/apps/:appId/stop', async (context) => {
      const appId = context.req.param('appId');
      await requireHubAction(context, appId, 'stop');
      return respond(context, async () => {
        await hub.stop(appId);
        logSecurityEvent(securityLogger, context, 'hub.app.stop', appId);
        return { success: true };
      });
    });
    routes.post('/apps/:appId/start', async (context) => {
      const appId = context.req.param('appId');
      await requireHubAction(context, appId, 'start');
      return respond(context, async () => {
        await hub.start(appId);
        logSecurityEvent(securityLogger, context, 'hub.app.start', appId);
        return { success: true };
      });
    });
    routes.post('/apps/:appId/restart', async (context) => {
      const appId = context.req.param('appId');
      await requireHubAction(context, appId, 'restart');
      return respond(context, async () => {
        await hub.restart(appId);
        logSecurityEvent(securityLogger, context, 'hub.app.restart', appId);
        return { success: true };
      });
    });
    routes.post('/apps/:appId/refresh', async (context) => {
      const appId = context.req.param('appId');
      await requireHubAction(context, appId, 'refresh');
      return respond(context, async () => {
        await hub.refresh(appId);
        logSecurityEvent(securityLogger, context, 'hub.app.refresh', appId);
        return { success: true };
      });
    });
    routes.delete('/apps/:appId', async (context) => {
      const appId = context.req.param('appId');
      await requireHubAction(context, appId, 'remove');
      return respond(context, async () => {
        await hub.remove(appId);
        logSecurityEvent(securityLogger, context, 'hub.app.remove', appId);
      });
    });
    routes.get('/host/status', async (context) => {
      await context.get('authz').require({
        resource: { type: 'hub.host', id: 'global' },
        action: 'read',
      });
      return respond(context, () => hub.hostStatus());
    });

    router.route('/hub', routes);
    return router;
  });

async function requireHubAction(
  context: Pick<Context<AuthorizationEnv>, 'get'>,
  appId: string,
  action: string,
): Promise<void> {
  await context.get('authz').require({
    resource: { type: 'hub.app', id: appId },
    action,
  });
}

function logSecurityEvent(
  logger: Logger | undefined,
  context: Pick<Context<AuthorizationEnv>, 'get'>,
  event: string,
  appId: string,
  details: Readonly<Record<string, unknown>> = {},
): void {
  logger?.info(
    {
      event,
      actorId: context.get('authz').identity.principal.id,
      appId,
      ...details,
    },
    event,
  );
}

async function respond<T>(
  context: Context,
  work: () => Promise<T>,
  status: 200 | 202 = 200,
): Promise<Response> {
  try {
    return context.json({ data: await work() }, status);
  } catch (error) {
    if (error instanceof HubError) {
      return context.json(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    }
    throw error;
  }
}

function preventSensitiveResponseCaching(context: Context): void {
  context.header('Cache-Control', 'no-store');
  context.header('Pragma', 'no-cache');
}

async function readBody(request: Request, limit: number): Promise<Uint8Array> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new HubError(
      `Artifact exceeds the ${limit} byte upload limit.`,
      'ARTIFACT_TOO_LARGE',
      413,
    );
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new HubError(
          `Artifact exceeds the ${limit} byte upload limit.`,
          'ARTIFACT_TOO_LARGE',
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;
