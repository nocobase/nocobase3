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
  type SaveHubConfigInput,
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
      respond(context, () => hub.listApps()),
    );
    routes.post('/apps', async (context) => {
      const input = await context.req.json<CreateHubAppInput>();
      return await respond(context, () => hub.createApp(input));
    });
    routes.get('/apps/:appId', async (context) =>
      respond(context, () => hub.getApp(context.req.param('appId'))),
    );
    routes.get('/apps/:appId/releases', async (context) =>
      respond(context, () => hub.listReleases(context.req.param('appId'))),
    );
    routes.get('/apps/:appId/releases/:releaseId', async (context) =>
      respond(context, () =>
        hub.getRelease(
          context.req.param('appId'),
          context.req.param('releaseId'),
        ),
      ),
    );
    routes.post('/apps/:appId/releases', async (context) =>
      respond(context, async () => {
        const version = context.req.header('x-release-version')?.trim();
        if (!version) {
          throw new HubError(
            'x-release-version header is required.',
            'VERSION_REQUIRED',
            422,
          );
        }
        return await hub.createRelease(context.req.param('appId'), {
          version,
          bytes: await readBody(context.req.raw, MAX_ARTIFACT_SIZE),
        });
      }),
    );
    routes.get('/apps/:appId/config', async (context) =>
      respond(context, () => hub.readConfig(context.req.param('appId'))),
    );
    routes.put('/apps/:appId/config', async (context) => {
      const input = await context.req.json<SaveHubConfigInput>();
      return await respond(context, () =>
        hub.saveConfig(context.req.param('appId'), input),
      );
    });
    routes.post('/apps/:appId/deploy', async (context) => {
      const input = await context.req.json<DeployHubAppInput>();
      return await respond(context, () =>
        hub.deploy(context.req.param('appId'), input),
      );
    });
    routes.post('/apps/:appId/stop', async (context) =>
      respond(context, () => hub.stop(context.req.param('appId'))),
    );
    routes.post('/apps/:appId/restart', async (context) =>
      respond(context, () => hub.restart(context.req.param('appId'))),
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
): Promise<Response> {
  try {
    return context.json({ data: await work() });
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
