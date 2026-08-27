import type { AppPluginRoutesContext } from '@nocobase/app-server-kit/plugins';
import { Hono, type Context, type MiddlewareHandler } from 'hono';

import { createFileRoute } from '../create-file-route.js';
import { FILES_DEMO_ORDER, FILES_DEMO_PROFILE } from '../demo/constants.js';
import {
  createOrderAttachmentStore,
  createProfileAvatarStore,
} from '../demo/stores.js';
import {
  isFilesPluginRuntimeUnavailable,
  resolveFilesPluginRuntime,
  type FilesPluginConfig,
  type FilesPluginDeps,
  type UnavailableFilesPluginRuntime,
} from '../plugin-runtime.js';
import type {
  CreateFileRouteOptions,
  FileRouteAction,
  FileStore,
} from '../types.js';

const ATTACHMENTS_PATH = '/api/attachments';
const PROFILE_AVATAR_AUDIENCE = 'files-demo-profile-avatar';
const ORDER_ATTACHMENTS_AUDIENCE = 'files-demo-order-attachments';
const SYSTEM_ADMINISTRATOR_PERMISSION_SET = 'system-administrator';
const FILES_DEMO_MANAGEMENT_RESOURCE = Object.freeze({
  type: 'files.demo',
  id: 'management',
});

interface FilesAuthorizationEnv {
  Variables: {
    authz: FilesAuthorizationScope;
  };
}

interface FilesAuthorizationScope {
  readonly identity: {
    readonly principal: { readonly type: string; readonly id: string };
    readonly subjects?: readonly {
      readonly type: string;
      readonly id: string;
    }[];
  };
}

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

export type FilesPluginRoutesContext = AppPluginRoutesContext<
  FilesPluginDeps,
  unknown,
  FilesPluginConfig
>;

export interface CreateFilesDemoRoutesOptions {
  readonly config: FilesPluginConfig;
  readonly deps: FilesPluginDeps;
}

export function createFilesDemoRoutes({
  config,
  deps,
}: CreateFilesDemoRoutesOptions): Hono<FilesAuthorizationEnv> {
  const runtime = resolveFilesPluginRuntime({ config, deps });
  let unavailable: UnavailableFilesPluginRuntime | undefined;
  let avatarStore: FileStore;
  let orderStore: FileStore;
  let drive: FilesPluginDeps['driveManager'];
  if (isFilesPluginRuntimeUnavailable(runtime)) {
    unavailable = runtime;
    avatarStore = createUnavailableStore(runtime);
    orderStore = createUnavailableStore(runtime);
  } else {
    avatarStore = createProfileAvatarStore(runtime.database);
    orderStore = createOrderAttachmentStore(runtime.database);
    drive = runtime.drive;
  }
  const auth = createManagementAuth(deps);
  const authorize = createManagementAuthorizer(deps);
  const routes = new Hono<FilesAuthorizationEnv>();

  routes.get(
    '/examples',
    auth,
    requireDemoAdministrator(deps, 'list'),
    (context) =>
      unavailable
        ? unavailableResponse(context, unavailable)
        : context.json({
            data: {
              profile: {
                ...FILES_DEMO_PROFILE,
                filesEndpoint: publicEndpoint(
                  config.app.publicBasePath,
                  `${ATTACHMENTS_PATH}/profiles/${FILES_DEMO_PROFILE.id}/avatar`,
                ),
              },
              order: {
                ...FILES_DEMO_ORDER,
                filesEndpoint: publicEndpoint(
                  config.app.publicBasePath,
                  `${ATTACHMENTS_PATH}/orders/${FILES_DEMO_ORDER.id}/files`,
                ),
              },
            },
          }),
  );

  routes.route(
    '/profiles/:profileId/avatar',
    createFileRoute({
      store: avatarStore,
      drive,
      defaultDisk: config.drive?.default ?? 'local',
      publicBasePath: config.app.publicBasePath,
      tokenSecret: config.session?.secret,
      audience: PROFILE_AVATAR_AUDIENCE,
      auth,
      authorize,
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
      store: orderStore,
      drive,
      defaultDisk: config.drive?.default ?? 'local',
      publicBasePath: config.app.publicBasePath,
      tokenSecret: config.session?.secret,
      audience: ORDER_ATTACHMENTS_AUDIENCE,
      auth,
      authorize,
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
  deps: FilesPluginDeps,
): MiddlewareHandler<FilesAuthorizationEnv> {
  const authenticate = deps.auth.required();
  const authorize = deps.authz.middleware();
  return (context, next) =>
    authenticate(context, async () => {
      await authorize(context, next);
    });
}

function requireDemoAdministrator(
  deps: FilesPluginDeps,
  action: FileRouteAction,
): MiddlewareHandler<FilesAuthorizationEnv> {
  return async (context, next) => {
    const denied = await requireDemoPermission(deps, context, action);
    if (denied) return denied;
    await next();
  };
}

function createManagementAuthorizer(
  deps: FilesPluginDeps,
): NonNullable<CreateFileRouteOptions['authorize']> {
  return (context, action) => requireDemoPermission(deps, context, action);
}

async function requireDemoPermission(
  deps: FilesPluginDeps,
  context: Context,
  action: FileRouteAction,
): Promise<Response | undefined> {
  const identity = resolveAuthorizationScope(context).identity;
  const permissionSets = await deps.authz.permissionSets.getEffective(identity);
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
        message: `System administrator access is required for ${FILES_DEMO_MANAGEMENT_RESOURCE.type}:${FILES_DEMO_MANAGEMENT_RESOURCE.id}:${action}.`,
      },
    },
    403,
  );
}

function resolveAuthorizationScope(context: Context): FilesAuthorizationScope {
  const value: unknown = Reflect.get(context.var, 'authz');
  if (!value || typeof value !== 'object' || !Reflect.get(value, 'identity')) {
    throw new Error('Files Demo authorization middleware is not configured');
  }
  return value as FilesAuthorizationScope;
}

export default function registerRoutes({
  app,
  config,
  deps,
}: FilesPluginRoutesContext): void {
  app.route(ATTACHMENTS_PATH, createFilesDemoRoutes({ config, deps }));
}

function createUnavailableStore(
  unavailable: UnavailableFilesPluginRuntime,
): FileStore {
  return {
    list: () => Promise.reject(unavailable.error),
    find: () => Promise.reject(unavailable.error),
    create: () => Promise.reject(unavailable.error),
    remove: () => Promise.reject(unavailable.error),
  };
}

function unavailableResponse(
  context: Context,
  unavailable: UnavailableFilesPluginRuntime,
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
