import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import { HubError } from '../services/hub.js';
import {
  hubServiceToken,
  type CreateHubAppInput,
  type DeployHubAppInput,
  type HubAppDetail,
  type HubReleaseRecord,
  type RollbackHubAppInput,
  type UpdateHubSettingsInput,
} from '../tokens.js';

const SYSTEM_ADMINISTRATOR = 'system-administrator';
const MAX_ARTIFACT_SIZE = 256 * 1024 * 1024;

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const authentication = container.resolve(authenticationToken);
    const authorization = container.resolve(authorizationToken);
    const hub = container.resolve(hubServiceToken);

    routes.use('*', authentication.required(), authorization.middleware());
    routes.use('*', async (context, next) => {
      const identity = context.get('authz').identity;
      const permissionSets =
        await authorization.permissionSets.getEffective(identity);
      if (!permissionSets.some((entry) => entry.key === SYSTEM_ADMINISTRATOR)) {
        return context.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'System administrator access is required.',
            },
          },
          403,
        );
      }
      await next();
    });

    routes.get('/apps', async (context) =>
      respond(context, async () =>
        (await hub.listApps()).map(releaseMetadataForApp),
      ),
    );
    routes.post('/apps', async (context) => {
      const input = await context.req.json<CreateHubAppInput>();
      return await respond(context, () => hub.createApp(input));
    });
    routes.get('/apps/:appId', async (context) =>
      respond(context, async () =>
        releaseMetadataForApp(await hub.getApp(context.req.param('appId'))),
      ),
    );
    routes.get('/apps/:appId/releases', async (context) =>
      respond(context, async () =>
        (await hub.listReleases(context.req.param('appId'))).map(
          releaseMetadata,
        ),
      ),
    );
    routes.get('/apps/:appId/releases/:releaseId', async (context) =>
      respond(context, async () =>
        releaseMetadata(
          await hub.getRelease(
            context.req.param('appId'),
            context.req.param('releaseId'),
          ),
        ),
      ),
    );
    routes.get(
      '/apps/:appId/releases/:releaseId/config-template',
      async (context) => {
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
    routes.post('/apps/:appId/releases', async (context) =>
      respond(context, async () => {
        return releaseMetadata(
          await hub.createRelease(context.req.param('appId'), {
            bytes: await readBody(context.req.raw, MAX_ARTIFACT_SIZE),
          }),
        );
      }),
    );
    routes.get('/apps/:appId/config', async (context) => {
      preventSensitiveResponseCaching(context);
      return await respond(context, () =>
        hub.readConfig(context.req.param('appId')),
      );
    });
    routes.put('/apps/:appId/settings', async (context) => {
      const input = await context.req.json<UpdateHubSettingsInput>();
      return await respond(context, () =>
        hub.updateSettings(context.req.param('appId'), input),
      );
    });
    routes.post('/apps/:appId/deploy', async (context) => {
      const input = await context.req.json<DeployHubAppInput>();
      return await respond(
        context,
        () => hub.deploy(context.req.param('appId'), input),
        202,
      );
    });
    routes.get('/apps/:appId/deployments', async (context) =>
      respond(context, () => hub.listDeployments(context.req.param('appId'))),
    );
    routes.get('/apps/:appId/deployments/:deploymentId', async (context) =>
      respond(context, () =>
        hub.getDeployment(
          context.req.param('appId'),
          context.req.param('deploymentId'),
        ),
      ),
    );
    routes.get(
      '/apps/:appId/deployments/:deploymentId/config',
      async (context) => {
        preventSensitiveResponseCaching(context);
        return await respond(context, () =>
          hub.readDeploymentConfig(
            context.req.param('appId'),
            context.req.param('deploymentId'),
          ),
        );
      },
    );
    routes.post('/apps/:appId/rollback', async (context) => {
      const input = await context.req.json<RollbackHubAppInput>();
      return await respond(
        context,
        () => hub.rollback(context.req.param('appId'), input),
        202,
      );
    });
    routes.post('/apps/:appId/stop', async (context) =>
      respond(context, () => hub.stop(context.req.param('appId'))),
    );
    routes.post('/apps/:appId/start', async (context) =>
      respond(context, () => hub.start(context.req.param('appId'))),
    );
    routes.post('/apps/:appId/refresh', async (context) =>
      respond(context, () => hub.refresh(context.req.param('appId'))),
    );
    routes.delete('/apps/:appId', async (context) =>
      respond(context, () => hub.remove(context.req.param('appId'))),
    );
    routes.get('/host/status', async (context) =>
      respond(context, () => hub.hostStatus()),
    );

    router.route('/hub', routes);
    return router;
  });

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

type HubReleaseMetadata = Omit<HubReleaseRecord, 'configTemplate'> & {
  readonly hasConfigTemplate: boolean;
};

function releaseMetadata(release: HubReleaseRecord): HubReleaseMetadata {
  const { configTemplate, ...metadata } = release;
  return { ...metadata, hasConfigTemplate: configTemplate !== null };
}

function releaseMetadataForApp(app: HubAppDetail): Omit<
  HubAppDetail,
  'releases'
> & {
  readonly releases: readonly HubReleaseMetadata[];
} {
  return { ...app, releases: app.releases.map(releaseMetadata) };
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
