import { HUB_RELEASE_ACTIONS } from '../../shared/permissions.js';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { loggingToken } from '@nocobase/app-server/logging';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import type { Logger } from '@nocobase/logging';

import { hubApiKeyServiceToken } from '../services/api-keys.js';
import type { CreateHubApiKeyInput } from '../../shared/api-keys.js';
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
import { HUB_PERMISSION_SET_KEYS } from '../authorization.js';
import {
  HubAppRoutes,
  publishingKeySecret,
  type HubRouteEnv,
} from './api-key-access.js';

const MAX_ARTIFACT_SIZE = 256 * 1024 * 1024;

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    const routes = new Hono<HubRouteEnv>();
    const authentication = container.resolve(authenticationToken);
    const authorization = container.resolve(authorizationToken);
    const { permissionSets } = authorization;
    const hub = container.resolve(hubServiceToken);
    const securityLogger = container.has(loggingToken)
      ? container.resolve(loggingToken).getLogger('security')
      : undefined;

    // App routes that declare their own access, including whether a publishing key may call them.
    const appRoutes = new HubAppRoutes({
      app: routes,
      apiKeys: () => container.resolve(hubApiKeyServiceToken),
      authorizationFor: (userId) =>
        authorization.for({
          principal: { type: 'user', id: userId },
          subjects: [{ type: 'authenticated', id: '*' }],
        }),
      ...(securityLogger ? { securityLogger } : {}),
    });

    // Publishing credentials never enter the Session authentication pipeline. A route accepts one only when it
    // declared a requirement through `appRoutes`, which then verifies the key against the App in its path.
    routes.use('*', async (context: Context<HubRouteEnv, string>, next) => {
      const credential = context.req.header('authorization');
      if (!credential) {
        if (
          /\/api-keys(?:\/|$)/.test(context.req.path) &&
          context.req.header('x-api-key')
        ) {
          return context.json(
            {
              error: {
                code: 'SESSION_REQUIRED',
                message: 'Sign in to manage publishing keys.',
              },
            },
            401,
          );
        }
        return next();
      }
      if (!publishingKeySecret(credential))
        return context.json(
          {
            error: {
              code: 'INVALID_API_KEY',
              message: 'Invalid publishing credential.',
            },
          },
          401,
        );
      if (!appRoutes.acceptsApiKey(context))
        return context.json(
          {
            error: {
              code: 'API_KEY_FORBIDDEN',
              message: 'This endpoint requires a signed-in user.',
            },
          },
          403,
        );
      return next();
    });
    routes.use(
      '*',
      authentication.required({
        skip: (context) => Boolean(context.req.header('authorization')),
      }),
    );
    routes.use('*', async (context: Context<HubRouteEnv, string>, next) => {
      if (context.req.header('authorization')) return next();
      return authorization.middleware()(context, next);
    });
    routes.onError((error, context) => {
      if (error instanceof AuthorizationDeniedError) {
        return context.json(
          { error: { code: 'FORBIDDEN', message: error.message } },
          403,
        );
      }
      throw error;
    });

    routes.get('/api-keys/apps', async (context) => {
      preventSensitiveResponseCaching(context);
      return respond(context, () =>
        container
          .resolve(hubApiKeyServiceToken)
          .appOptions(context.get('authz').identity.principal.id),
      );
    });
    routes.get('/api-keys', async (context) => {
      preventSensitiveResponseCaching(context);
      const appId = '*';
      await requireHubAction(context, appId, 'manage-api-keys');
      return respond(context, () =>
        container
          .resolve(hubApiKeyServiceToken)
          .list(context.get('authz').identity.principal.id),
      );
    });
    routes.post('/api-keys', async (context) => {
      preventSensitiveResponseCaching(context);
      const appId = '*';
      await requireHubAction(context, appId, 'manage-api-keys');
      const input = await context.req.json<CreateHubApiKeyInput>();
      return respond(context, async () => {
        const result = await container
          .resolve(hubApiKeyServiceToken)
          .create(context.get('authz').identity.principal.id, input);
        logSecurityEvent(securityLogger, context, 'hub.api-key.create', appId, {
          keyId: result.key.id,
        });
        return result;
      });
    });
    routes.post('/api-keys/:keyId/reveal', async (context) => {
      preventSensitiveResponseCaching(context);
      await requireHubAction(context, '*', 'manage-api-keys');
      return respond(context, async () => {
        const keyId = context.req.param('keyId');
        const secret = await container
          .resolve(hubApiKeyServiceToken)
          .reveal(keyId, context.get('authz').identity.principal.id);
        logSecurityEvent(securityLogger, context, 'hub.api-key.reveal', '*', {
          keyId,
        });
        return { secret };
      });
    });
    routes.post('/api-keys/:keyId/disable', async (context) => {
      preventSensitiveResponseCaching(context);
      const appId = '*';
      const keyId = context.req.param('keyId');
      await requireHubAction(context, appId, 'manage-api-keys');
      return respond(context, async () => {
        await container
          .resolve(hubApiKeyServiceToken)
          .disable(keyId, context.get('authz').identity.principal.id);
        logSecurityEvent(
          securityLogger,
          context,
          'hub.api-key.disable',
          appId,
          { keyId },
        );
        return { success: true };
      });
    });
    routes.delete('/api-keys/:keyId', async (context) => {
      preventSensitiveResponseCaching(context);
      const appId = '*';
      const keyId = context.req.param('keyId');
      await requireHubAction(context, appId, 'manage-api-keys');
      return respond(context, async () => {
        await container
          .resolve(hubApiKeyServiceToken)
          .remove(keyId, context.get('authz').identity.principal.id);
        logSecurityEvent(securityLogger, context, 'hub.api-key.delete', appId, {
          keyId,
        });
        return { success: true };
      });
    });

    routes.get('/apps', async (context) => {
      await requireHubAction(context, '*', 'read');
      const authz = context.get('authz');
      const allApps = await authz.can({
        resource: { type: 'hub.app', id: '*' },
        action: 'read-all',
      });
      const search = context.req.query('search');
      const page = context.req.query('page');
      const pageSize = context.req.query('pageSize');
      return respond(context, async () => {
        const result = await hub.listAppsPage({
          ...(allApps ? {} : { createdBy: authz.identity.principal.id }),
          ...(search === undefined ? {} : { search }),
          ...(page === undefined ? {} : { page: Number(page) }),
          ...(pageSize === undefined ? {} : { pageSize: Number(pageSize) }),
        });
        return {
          ...result,
          items: result.items.map(appSummaryResponse),
        };
      });
    });
    routes.get('/roles', async (context) => {
      await context.get('authz').require({
        resource: { type: 'user', id: '*' },
        action: 'read',
      });
      const sets = await permissionSets.list();
      const byKey = new Map(
        sets.map((permissionSet) => [permissionSet.key, permissionSet]),
      );
      return context.json({
        data: HUB_PERMISSION_SET_KEYS.flatMap((key) => {
          const permissionSet = byKey.get(key);
          return permissionSet
            ? [
                {
                  key: permissionSet.key,
                  title: permissionSet.title,
                  grants: permissionSet.grants.map((grant) => ({
                    resource: grant.resource,
                    actions: grant.actions.map(({ action }) => action),
                  })),
                },
              ]
            : [];
        }),
      });
    });
    routes.post('/apps', async (context) => {
      await requireHubAction(context, '*', 'create');
      const input = await context.req.json<CreateHubAppInput>();
      return await respond(context, async () => {
        const app = await hub.createApp(
          input,
          context.get('authz').identity.principal.id,
        );
        logSecurityEvent(securityLogger, context, 'hub.app.create', app.app.id);
        return { id: app.app.id };
      });
    });
    appRoutes.get(
      '/apps/:appId',
      { action: 'read', apiKey: 'any' },
      async (context) =>
        respond(context, async () =>
          appDetailResponse(await hub.getApp(context.req.param('appId'))),
        ),
    );
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
    appRoutes.post(
      '/apps/:appId/releases',
      {
        action: HUB_RELEASE_ACTIONS.upload,
        apiKey: HUB_RELEASE_ACTIONS.upload,
      },
      async (context) => {
        const appId = context.req.param('appId');
        return respond(context, async () => {
          const contentType = context.req
            .header('content-type')
            ?.split(';')[0]
            ?.trim();
          if (
            contentType !== 'application/gzip' &&
            contentType !== 'application/octet-stream'
          )
            throw new HubError(
              'Use application/gzip for release uploads.',
              'INVALID_CONTENT_TYPE',
              400,
            );
          const length = context.req.header('content-length');
          if (length !== undefined && !/^\d+$/.test(length))
            throw new HubError(
              'Invalid Content-Length.',
              'INVALID_CONTENT_LENGTH',
              400,
            );
          if (length !== undefined && Number(length) > MAX_ARTIFACT_SIZE)
            throw new HubError(
              'Invalid or excessive artifact length.',
              'ARTIFACT_TOO_LARGE',
              413,
            );
          const chunks = requestChunks(context.req.raw);
          let release;
          try {
            release = await hub.createRelease(appId, {
              stream: chunks,
              checksum: context.req.header('x-artifact-sha256'),
              idempotencyKey: context.req.header('idempotency-key'),
            });
          } finally {
            await chunks.return(undefined);
          }
          logSecurityEvent(
            securityLogger,
            context,
            'hub.release.upload',
            appId,
            {
              releaseId: release.id,
            },
          );
          return {
            ...releaseResponse(release),
            releaseId: release.id,
            reused: release.reused ?? false,
          };
        });
      },
    );
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
    appRoutes.post(
      '/apps/:appId/deploy',
      {
        action: HUB_RELEASE_ACTIONS.deploy,
        apiKey: HUB_RELEASE_ACTIONS.deploy,
      },
      async (context) => {
        const appId = context.req.param('appId');
        const input = await context.req.json<DeployHubAppInput>();
        return await respond(
          context,
          async () => {
            const deployment = await hub.deploy(appId, {
              ...input,
              idempotencyKey: context.req.header('idempotency-key'),
            });
            logSecurityEvent(securityLogger, context, 'hub.app.deploy', appId, {
              deploymentId: deployment.id,
            });
            return {
              id: deployment.id,
              operationId: deployment.id,
              status: deployment.status,
              // A reused operation was created by an earlier request, so the App may be running
              // another Release by now. Clients must not read it as "this Release is live".
              reused: deployment.reused === true,
              createdAt: deployment.createdAt,
            };
          },
          202,
        );
      },
    );
    // Any publishing key for the App may observe a minimal result, never configuration or logs.
    appRoutes.get(
      '/apps/:appId/deployments/:deploymentId/status',
      { action: HUB_RELEASE_ACTIONS.deploy, apiKey: 'any' },
      async (context) => {
        const appId = context.req.param('appId');
        preventSensitiveResponseCaching(context);
        return respond(context, async () => {
          const deployment = await hub.getDeployment(
            appId,
            context.req.param('deploymentId'),
          );
          return {
            operationId: deployment.id,
            releaseId: deployment.releaseId,
            status: deployment.status,
            phase: deployment.phase,
          };
        });
      },
    );

    for (const route of [
      '/apps/:appId/logs',
      '/apps/:appId/deployments/:deploymentId/logs',
    ]) {
      routes.get(route, async (context) => {
        const appId = context.req.param('appId')!;
        const deploymentId = context.req.param('deploymentId');
        await requireHubAction(
          context,
          appId,
          deploymentId ? 'read-deployment' : 'read-log',
        );
        preventSensitiveResponseCaching(context);
        return respond(context, () =>
          hub.readLogs(
            appId,
            {
              cursor: context.req.query('cursor'),
              level: context.req.query('level'),
              source: context.req.query('source'),
              search: context.req.query('search'),
              since: context.req.query('since'),
              until: context.req.query('until'),
              fromStart: context.req.query('fromStart') === 'true',
            },
            deploymentId,
          ),
        );
      });
    }
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
          return {
            id: deployment.id,
            operationId: deployment.id,
            status: deployment.status,
          };
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
      return respond(context, async () => {
        const status = await hub.hostStatus();
        const authz = context.get('authz');
        const visible = await Promise.all(
          status.deployments.map(async (deployment) =>
            (await authz.can({
              resource: { type: 'hub.app', id: deployment.appId },
              action: 'read',
            }))
              ? deployment
              : null,
          ),
        );
        return {
          ...status,
          deployments: visible.filter((deployment) => deployment !== null),
        };
      });
    });

    router.route('/hub', routes);
    return router;
  });

async function requireHubAction(
  context: Pick<Context<HubRouteEnv>, 'get'>,
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
  context: Pick<Context<HubRouteEnv>, 'get'>,
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
    const data = await work();
    return context.json({ data }, status);
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

async function* requestChunks(request: Request): AsyncGenerator<Uint8Array> {
  if (!request.body) return;
  const reader = request.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;
