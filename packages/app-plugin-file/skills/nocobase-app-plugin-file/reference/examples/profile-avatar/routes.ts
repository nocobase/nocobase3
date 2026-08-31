import { databaseManagerToken } from '@nocobase/app-database';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
  type AuthorizationScope,
} from '@nocobase/app-plugin-authorization';
import {
  createFileRoute,
  type FileRouteAction,
  type FileRouteAuthorizer,
} from '@nocobase/app-plugin-file/server';
import { appConfig } from '@nocobase/app-server-kit/config';
import { driveConfig, driveManagerToken } from '@nocobase/app-server-kit/drive';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server-kit/router';
import { sessionConfig } from '@nocobase/app-server-kit/session';
import { Hono, type Context, type MiddlewareHandler } from 'hono';

type Env = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ config, container }) => {
    const router = new Hono();
    const authentication = container.resolve(authenticationToken);
    const authorization = container.resolve(authorizationToken);
    const database = container.resolve(databaseManagerToken);
    const driveManager = container.resolve(driveManagerToken);
    const app = config.get(appConfig);
    const drive = config.get(driveConfig);
    const session = config.get(sessionConfig);
    const authenticate =
      authentication.required() as unknown as MiddlewareHandler<Env>;
    const resolveAuthorization =
      authorization.middleware() as unknown as MiddlewareHandler<Env>;
    const requireManagement: MiddlewareHandler<Env> = (context, next) =>
      authenticate(context, async () => {
        await resolveAuthorization(context, next);
      });

    router.route(
      '/profiles/:profileId/avatar',
      createFileRoute({
        database,
        table: 'profileAvatars',
        scope: (context) => ({
          profileId: positiveInteger(
            context.req.param('profileId'),
            'A valid profileId is required.',
          ),
        }),
        drive: driveManager,
        defaultDisk: drive.default,
        publicBasePath: app.publicBasePath,
        tokenSecret: session.secret,
        audience: 'profile-avatar',
        auth: requireManagement,
        authorize: authorizeProfileAvatar,
        visibility: {
          default: 'private',
          allowClientOverride: false,
        },
        limits: {
          maxSize: 5 * 1024 * 1024,
          maxFiles: 1,
          mimeTypes: ['image/png', 'image/jpeg'],
        },
      }),
    );

    return router;
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;

const authorizeProfileAvatar: FileRouteAuthorizer = async (context, action) => {
  const profileId = positiveInteger(
    context.req.param('profileId'),
    'A valid profileId is required.',
  );
  const decision = await authorizationScope(context).authorize({
    resource: { type: 'profile', id: String(profileId) },
    action: profileAction(action),
  });
  if (decision.effect !== 'permit') {
    return context.json(
      { code: 'FORBIDDEN', message: 'Profile access is required.' },
      403,
    );
  }
};

function authorizationScope(context: Context): AuthorizationScope {
  const value: unknown = Reflect.get(context.var, 'authz');
  if (
    !value ||
    typeof value !== 'object' ||
    typeof Reflect.get(value, 'authorize') !== 'function'
  ) {
    throw new Error('Authorization middleware is not configured.');
  }
  return value as AuthorizationScope;
}

function profileAction(action: FileRouteAction): 'read' | 'update' {
  return action === 'upload' || action === 'delete' ? 'update' : 'read';
}

function positiveInteger(value: string | undefined, message: string): number {
  if (!value || !/^\d+$/u.test(value)) throw new TypeError(message);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new TypeError(message);
  }
  return parsed;
}
