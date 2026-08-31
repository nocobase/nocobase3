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

const allowedMimeTypes = ['application/pdf'] as const;

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
      '/purchase-orders/:orderId/attachments',
      createFileRoute({
        database,
        table: 'purchaseOrderAttachments',
        scope: (context) => ({
          orderId: positiveInteger(
            context.req.param('orderId'),
            'A valid orderId is required.',
          ),
        }),
        order: { field: 'createdAt', direction: 'desc' },
        drive: driveManager,
        defaultDisk: drive.default,
        publicBasePath: app.publicBasePath,
        tokenSecret: session.secret,
        audience: 'purchase-order-attachments',
        auth: requireManagement,
        authorize: authorizePurchaseOrderFile,
        visibility: {
          default: 'private',
          allowClientOverride: false,
        },
        limits: {
          maxSize: 50 * 1024 * 1024,
          maxFiles: 10,
          mimeTypes: allowedMimeTypes,
        },
      }),
    );

    return router;
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;

const authorizePurchaseOrderFile: FileRouteAuthorizer = async (
  context,
  action,
) => {
  const orderId = positiveInteger(
    context.req.param('orderId'),
    'A valid orderId is required.',
  );
  const decision = await authorizationScope(context).authorize({
    resource: { type: 'purchase-order', id: String(orderId) },
    action: purchaseOrderAction(action),
  });
  if (decision.effect !== 'permit') {
    return context.json(
      { code: 'FORBIDDEN', message: 'Purchase order access is required.' },
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

function purchaseOrderAction(action: FileRouteAction): 'read' | 'update' {
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
