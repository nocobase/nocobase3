import { Hono } from 'hono';

import type { SettingsAuthorizer } from './authorization.js';
import { SettingsError } from './errors.js';
import { SettingsService } from './service.js';
import type { StorageSettingsDraft } from './types.js';

export interface SettingsRoutesOptions {
  service: SettingsService;
  authorize: SettingsAuthorizer;
  defaultAppId?: string;
  /** @deprecated Use defaultAppId. */
  appId?: string;
}

export function createSettingsRoutes(options: SettingsRoutesOptions): Hono {
  const routes = new Hono();
  const defaultAppId = options.defaultAppId ?? options.appId ?? 'hub';

  routes.onError((error) => {
    const known = error instanceof SettingsError;
    if (!known || error.status >= 500) console.error(error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : '配置服务失败',
        code: known ? error.code : 'SETTINGS_ERROR',
      },
      { status: known ? error.status : 500 },
    );
  });

  routes.get('/storage', async (context) => {
    const actor = await options.authorize(context.req.raw);
    const data = await options.service.getStorage(defaultAppId, actor);
    return context.json({ data });
  });

  routes.put('/storage', async (context) => {
    const actor = await options.authorize(context.req.raw);
    const draft = await readStorageBody(context.req.raw);
    const data = await options.service.saveStorage(defaultAppId, draft, actor);
    return context.json({ data });
  });

  routes.post('/storage/test', async (context) => {
    const actor = await options.authorize(context.req.raw);
    const draft = await readStorageBody(context.req.raw);
    const data = await options.service.testStorage(defaultAppId, draft, actor);
    return context.json({ data });
  });

  routes.get('/apps/:appId/storage', async (context) => {
    const actor = await options.authorize(context.req.raw);
    const data = await options.service.getStorage(
      readAppId(context.req.param('appId')),
      actor,
    );
    return context.json({ data });
  });

  routes.put('/apps/:appId/storage', async (context) => {
    const actor = await options.authorize(context.req.raw);
    const draft = await readStorageBody(context.req.raw);
    const data = await options.service.saveStorage(
      readAppId(context.req.param('appId')),
      draft,
      actor,
    );
    return context.json({ data });
  });

  routes.post('/apps/:appId/storage/test', async (context) => {
    const actor = await options.authorize(context.req.raw);
    const draft = await readStorageBody(context.req.raw);
    const data = await options.service.testStorage(
      readAppId(context.req.param('appId')),
      draft,
      actor,
    );
    return context.json({ data });
  });

  return routes;
}

function readAppId(value: string): string {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value) ||
    value === '.' ||
    value === '..'
  ) {
    throw new SettingsError('App ID 格式无效', {
      status: 400,
      code: 'SETTINGS_APP_ID_INVALID',
    });
  }
  return value;
}

async function readStorageBody(
  request: Request,
): Promise<StorageSettingsDraft> {
  const body = await request.text();
  if (Buffer.byteLength(body, 'utf8') > 64 * 1024) {
    throw new SettingsError('配置请求过大', {
      status: 413,
      code: 'SETTINGS_BODY_TOO_LARGE',
    });
  }

  let value: unknown;
  try {
    value = JSON.parse(body) as unknown;
  } catch (error) {
    throw new SettingsError('Request body must be valid JSON', {
      status: 400,
      code: 'SETTINGS_INVALID_JSON',
      cause: error,
    });
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SettingsError('配置请求内容无效', {
      status: 400,
      code: 'SETTINGS_INVALID_BODY',
    });
  }
  return value as StorageSettingsDraft;
}
