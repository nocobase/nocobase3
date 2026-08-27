import type { AppPluginRoutesContext } from '@nocobase/app-server-kit/plugins';
import { Hono, type Context } from 'hono';

import { createFileRoute } from '../create-file-route.js';
import { FILES_DEMO_ORDER, FILES_DEMO_PROFILE } from '../demo/constants.js';
import {
  createOrderAttachmentStore,
  createProfileAvatarStore,
} from '../demo/stores.js';
import {
  createPluginFilesService,
  isFilesPluginServiceUnavailable,
  type FilesPluginConfig,
  type FilesPluginDeps,
  type UnavailableFilesPluginService,
} from '../plugin-runtime.js';
import type { FileStore, FilesService } from '../types.js';

const ATTACHMENTS_PATH = '/api/attachments';
const PROFILE_AVATAR_AUDIENCE = 'files-demo-profile-avatar';
const ORDER_ATTACHMENTS_AUDIENCE = 'files-demo-order-attachments';

const AVATAR_MIME_TYPES: readonly string[] = Object.freeze([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
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

export interface CreateFilesRoutesOptions {
  readonly config: FilesPluginConfig;
  readonly deps: FilesPluginDeps;
}

export function createFilesRoutes({
  config,
  deps,
}: CreateFilesRoutesOptions): Hono {
  const service = createPluginFilesService({ config, deps });
  let files: FilesService;
  let unavailable: UnavailableFilesPluginService | undefined;
  if (isFilesPluginServiceUnavailable(service)) {
    unavailable = service;
    files = service.files;
  } else {
    files = service;
  }
  const auth = deps.auth.required();
  const routes = new Hono();

  routes.get('/examples', auth, (context) =>
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
      files,
      store: unavailable
        ? createUnavailableStore(unavailable)
        : createProfileAvatarStore(files),
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
      files,
      store: unavailable
        ? createUnavailableStore(unavailable)
        : createOrderAttachmentStore(files),
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

export default function registerFilesRoutes({
  app,
  config,
  deps,
}: FilesPluginRoutesContext): void {
  app.route(ATTACHMENTS_PATH, createFilesRoutes({ config, deps }));
}

function createUnavailableStore(
  unavailable: UnavailableFilesPluginService,
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
  unavailable: UnavailableFilesPluginService,
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
