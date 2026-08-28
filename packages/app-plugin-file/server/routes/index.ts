import {
  authenticationToken,
  type Auth,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AppAuthorization,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import type { ServiceResolver } from '@nocobase/service-provider';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { prepareFileDemoFixtures } from '../provider.js';
import { createFileRoute } from '../create-file-route.js';
import {
  FILE_DEMO_COLLECTIONS,
  FILE_DEMO_ORDER,
  FILE_DEMO_PROFILE,
} from '../demo/constants.js';
import {
  isFilePluginRuntimeUnavailable,
  type FilePluginConfig,
  type FilePluginRuntime,
  type UnavailableFilePluginRuntime,
} from '../plugin-runtime.js';
import { filePluginRuntimeToken } from '../runtime-token.js';
import type {
  CustomFileRouteSource,
  DatabaseFileRouteSource,
  FileStore,
} from '../types.js';

const ATTACHMENTS_PATH = '/api/attachments';
const PROFILE_AVATAR_AUDIENCE = 'file-demo-profile-avatar';
const ORDER_ATTACHMENTS_AUDIENCE = 'file-demo-order-attachments';
const SYSTEM_ADMINISTRATOR_PERMISSION_SET = 'system-administrator';
const FILE_DEMO_MANAGEMENT_RESOURCE = Object.freeze({
  type: 'file.demo',
  id: 'management',
});

interface FileAuthorizationEnv {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
}

type FileAuthorizationScope = AuthorizationEnv['Variables']['authz'];

const AVATAR_MIME_TYPES: readonly string[] = Object.freeze([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const ORDER_ATTACHMENT_MIME_TYPES: readonly string[] = Object.freeze([
  ...AVATAR_MIME_TYPES,
  'application/json',
  'application/pdf',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'text/plain',
  'video/mp4',
  'video/webm',
]);

export interface CreateFileDemoRoutesOptions {
  readonly config: FilePluginConfig;
  readonly container: ServiceResolver;
}

export function createFileDemoRoutes({
  config,
  container,
}: CreateFileDemoRoutesOptions): Hono<FileAuthorizationEnv> {
  const runtime = container.resolve(filePluginRuntimeToken);
  let unavailable: UnavailableFilePluginRuntime | undefined;
  let drive: FilePluginRuntime['drive'] | undefined;
  let readiness: Promise<void> | undefined;
  if (isFilePluginRuntimeUnavailable(runtime)) {
    unavailable = runtime;
  } else {
    drive = runtime.drive;
    readiness = prepareFileDemoFixtures(runtime);
  }
  const auth = createManagementAuth(
    container.resolve(authenticationToken),
    container.resolve(authorizationToken),
    readiness,
  );
  const routes = new Hono<FileAuthorizationEnv>();
  const waitForContent = createReadinessMiddleware(readiness);
  const avatarSource: DatabaseFileRouteSource | CustomFileRouteSource =
    isFilePluginRuntimeUnavailable(runtime)
      ? { store: createUnavailableStore(runtime) }
      : {
          database: runtime.database,
          table: FILE_DEMO_COLLECTIONS.profileAvatars,
          scope: (context) => ({
            profileId: parsePositiveIntegerPathParameter(
              context.req.param('profileId'),
            ),
          }),
        };
  const orderSource: DatabaseFileRouteSource | CustomFileRouteSource =
    isFilePluginRuntimeUnavailable(runtime)
      ? { store: createUnavailableStore(runtime) }
      : {
          database: runtime.database,
          table: FILE_DEMO_COLLECTIONS.orderAttachments,
          scope: (context) => ({
            orderId: parsePositiveIntegerPathParameter(
              context.req.param('orderId'),
            ),
          }),
        };

  routes.use('/profiles/:profileId/avatar/:id/content', waitForContent);
  routes.use('/orders/:orderId/files/:id/content', waitForContent);

  routes.get('/examples', auth, (context) =>
    unavailable
      ? unavailableResponse(context, unavailable)
      : context.json({
          data: {
            profile: {
              ...FILE_DEMO_PROFILE,
              filesEndpoint: publicEndpoint(
                config.app.publicBasePath,
                `${ATTACHMENTS_PATH}/profiles/${FILE_DEMO_PROFILE.id}/avatar`,
              ),
            },
            order: {
              ...FILE_DEMO_ORDER,
              filesEndpoint: publicEndpoint(
                config.app.publicBasePath,
                `${ATTACHMENTS_PATH}/orders/${FILE_DEMO_ORDER.id}/files`,
              ),
            },
          },
        }),
  );

  routes.route(
    '/profiles/:profileId/avatar',
    createFileRoute({
      ...avatarSource,
      drive,
      defaultDisk: config.drive?.default ?? 'local',
      publicBasePath: config.app.publicBasePath,
      tokenSecret: config.session?.secret,
      audience: PROFILE_AVATAR_AUDIENCE,
      auth,
      visibility: {
        default: 'private',
        allowClientOverride: false,
      },
      limits: {
        maxSize: 5 * 1024 * 1024,
        maxFiles: 1,
        mimeTypes: AVATAR_MIME_TYPES,
      },
    }),
  );
  routes.route(
    '/orders/:orderId/files',
    createFileRoute({
      ...orderSource,
      drive,
      defaultDisk: config.drive?.default ?? 'local',
      publicBasePath: config.app.publicBasePath,
      tokenSecret: config.session?.secret,
      audience: ORDER_ATTACHMENTS_AUDIENCE,
      auth,
      visibility: {
        default: 'private',
        allowClientOverride: true,
      },
      limits: {
        maxSize: 50 * 1024 * 1024,
        maxFiles: 10,
        mimeTypes: ORDER_ATTACHMENT_MIME_TYPES,
      },
    }),
  );

  return routes;
}

function createManagementAuth(
  auth: Pick<Auth, 'required'>,
  authz: Pick<AppAuthorization, 'middleware' | 'permissionSets'>,
  readiness: Promise<void> | undefined,
): MiddlewareHandler<FileAuthorizationEnv> {
  const authenticate =
    auth.required() as unknown as MiddlewareHandler<FileAuthorizationEnv>;
  const authorize =
    authz.middleware() as unknown as MiddlewareHandler<FileAuthorizationEnv>;
  return (context, next) =>
    authenticate(context, async () => {
      await authorize(context, async () => {
        const denied = await requireDemoAdministrator(authz, context);
        if (denied) {
          context.res = denied;
          return;
        }
        const unavailable = await waitForReadiness(context, readiness);
        if (unavailable) {
          context.res = unavailable;
          return;
        }
        await next();
      });
    });
}

async function requireDemoAdministrator(
  authz: Pick<AppAuthorization, 'permissionSets'>,
  context: Context,
): Promise<Response | undefined> {
  const identity = resolveAuthorizationScope(context).identity;
  const permissionSets = await authz.permissionSets.getEffective(identity);
  if (
    permissionSets.some(
      (permissionSet) =>
        permissionSet.key === SYSTEM_ADMINISTRATOR_PERMISSION_SET,
    )
  ) {
    return undefined;
  }
  return context.json(
    {
      error: {
        code: 'FORBIDDEN',
        message: `System administrator access is required for ${FILE_DEMO_MANAGEMENT_RESOURCE.type}:${FILE_DEMO_MANAGEMENT_RESOURCE.id}.`,
      },
    },
    403,
  );
}

function createReadinessMiddleware(
  readiness: Promise<void> | undefined,
): MiddlewareHandler<FileAuthorizationEnv> {
  return async (context, next) => {
    const unavailable = await waitForReadiness(context, readiness);
    if (unavailable) return unavailable;
    await next();
  };
}

async function waitForReadiness(
  context: Context,
  readiness: Promise<void> | undefined,
): Promise<Response | undefined> {
  try {
    await readiness;
    return undefined;
  } catch (error) {
    return context.json(
      {
        error: {
          code: 'FILE_UNAVAILABLE',
          message:
            error instanceof Error
              ? error.message
              : 'File Demo fixture initialization failed.',
        },
      },
      503,
    );
  }
}

function resolveAuthorizationScope(context: Context): FileAuthorizationScope {
  const value: unknown = Reflect.get(context.var, 'authz');
  if (!value || typeof value !== 'object' || !Reflect.get(value, 'identity')) {
    throw new Error('File Demo authorization middleware is not configured');
  }
  return value as FileAuthorizationScope;
}

export default function registerRoutes(
  app: AppPluginApplication,
  router: Hono,
): void {
  router.route(
    '/attachments',
    createFileDemoRoutes({ config: app.config, container: app.container }),
  );
}

function createUnavailableStore(
  unavailable: UnavailableFilePluginRuntime,
): FileStore {
  return {
    list: () => Promise.reject(unavailable.error),
    find: () => Promise.reject(unavailable.error),
    create: () => Promise.reject(unavailable.error),
    remove: () => Promise.reject(unavailable.error),
  };
}

function parsePositiveIntegerPathParameter(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new HTTPException(400, {
      message: 'File scope path parameter must be a positive integer.',
    });
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new HTTPException(400, {
      message: 'File scope path parameter must be a positive integer.',
    });
  }
  return parsed;
}

function unavailableResponse(
  context: Context,
  unavailable: UnavailableFilePluginRuntime,
): Response {
  return context.json(
    {
      error: {
        code: unavailable.error.code,
        message: unavailable.error.message,
      },
    },
    503,
  );
}

function publicEndpoint(publicBasePath: string, endpoint: string): string {
  const base = normalizePath(publicBasePath);
  const path = normalizePath(endpoint);
  if (!base || path === base || path.startsWith(`${base}/`)) {
    return path || '/';
  }
  return `${base}${path}`;
}

function normalizePath(value: string): string {
  const normalized = value.trim().replace(/^\/+|\/+$/g, '');
  return normalized ? `/${normalized}` : '';
}
