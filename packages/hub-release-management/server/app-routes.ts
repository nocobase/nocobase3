import { Hono } from 'hono';

import type { ReleaseAuthorizer } from './authorization.js';
import { ReleaseManagementError } from './errors.js';
import type { ReleaseManagementService } from './service.js';

export interface AppManagementRoutesOptions {
  service: ReleaseManagementService;
  authorize: ReleaseAuthorizer;
}

export function createAppManagementRoutes(
  options: AppManagementRoutesOptions,
): Hono {
  const routes = new Hono();

  routes.onError((error) => {
    const known = error instanceof ReleaseManagementError;
    if (!known || error.status >= 500) console.error(error);
    return Response.json(
      {
        error: error.message,
        code: known ? error.code : 'APP_MANAGEMENT_ERROR',
      },
      { status: known ? error.status : 500 },
    );
  });

  routes.get('/', async (context) => {
    await options.authorize(context.req.raw);
    const overview = await options.service.overview();
    return context.json({ apps: overview.apps });
  });

  routes.post('/', async (context) => {
    const request = context.req.raw;
    const actor = await options.authorize(request);
    const input = await readBody(request);
    if (typeof input.id !== 'string') {
      throw new ReleaseManagementError('id must be a string', {
        status: 400,
        code: 'INVALID_APP_ID',
      });
    }
    if (input.name !== undefined && typeof input.name !== 'string') {
      throw new ReleaseManagementError('name must be a string', {
        status: 400,
        code: 'INVALID_APP_NAME',
      });
    }
    if (
      input.type !== undefined &&
      input.type !== 'app' &&
      input.type !== 'portal'
    ) {
      throw new ReleaseManagementError('type must be app or portal', {
        status: 400,
        code: 'INVALID_APP_TYPE',
      });
    }
    const result = await options.service.createManagedApp({
      id: input.id,
      name: input.name,
      type: input.type,
      actor,
    });
    return context.json(result, result.created ? 201 : 200);
  });

  routes.delete('/:appId', async (context) => {
    await options.authorize(context.req.raw);
    const result = await options.service.unregisterManagedApp({
      id: context.req.param('appId'),
    });
    return context.json(result);
  });

  return routes;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch (error) {
    throw new ReleaseManagementError('Request body must be valid JSON', {
      status: 400,
      code: 'INVALID_JSON_BODY',
      cause: error,
    });
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ReleaseManagementError('Request body must be a JSON object', {
      status: 400,
      code: 'INVALID_JSON_BODY',
    });
  }
  return value as Record<string, unknown>;
}
