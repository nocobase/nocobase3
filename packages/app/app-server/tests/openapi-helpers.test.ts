import { Hono } from 'hono';
import { validator } from 'hono/validator';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  apiErrorHandler,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  describeRoute,
  emptyResponse,
  generateApiDocument,
  listResponse,
  parseApiInput,
} from '../src/router/index.js';

const DeployParams = z.object({ appId: z.string().regex(/^\d+$/) });
const DeployQuery = z.object({ dryRun: z.enum(['true', 'false']).optional() });
const DeployInput = z.strictObject({
  releaseId: z.string().meta({ description: 'The release to deploy.' }),
  note: z.string().min(1).optional(),
});
const Deployment = z
  .object({ id: z.string(), releaseId: z.string() })
  .meta({ ref: 'HubDeployment' });

function routerWith(
  register: (router: Hono) => void,
): (path: string, init?: RequestInit) => Promise<Response> {
  const router = new Hono();
  router.onError(apiErrorHandler);
  register(router);
  return async (path, init) => router.request(path, init);
}

// A fixed request id, so the error bodies of two routers compare equal.
const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-request-id': 'trace-1' },
  body: JSON.stringify(body),
});

describe('apiValidator', () => {
  const request = routerWith((router) => {
    router.post(
      '/apps/:appId/deploy',
      apiValidator('param', DeployParams),
      apiValidator('query', DeployQuery),
      apiValidator('json', DeployInput),
      (context) =>
        context.json(
          {
            data: {
              ...context.req.valid('param'),
              ...context.req.valid('query'),
              ...context.req.valid('json'),
            },
          },
          202,
        ),
    );
  });
  const legacy = routerWith((router) => {
    router.post(
      '/apps/:appId/deploy',
      validator('json', (value) => parseApiInput(DeployInput, value)),
      (context) => context.json({ data: context.req.valid('json') }, 202),
    );
  });

  it('passes the parsed input to the handler', async () => {
    const response = await request(
      '/apps/7/deploy?dryRun=true',
      json({ releaseId: 'r1' }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      data: { appId: '7', dryRun: 'true', releaseId: 'r1' },
    });
  });

  it('answers 400 INVALID_INPUT with a field violation per issue, as parseApiInput does', async () => {
    const response = await request('/apps/7/deploy', json({}));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: unknown };
    expect(body).toMatchObject({
      error: {
        code: 400,
        status: 'INVALID_ARGUMENT',
        reason: 'INVALID_INPUT',
        domain: 'app',
        message: 'The request contains invalid fields.',
        fieldViolations: [
          {
            field: 'releaseId',
            reason: 'invalid_type',
          },
        ],
      },
    });
    const legacyBody = (await (
      await legacy('/apps/7/deploy', json({}))
    ).json()) as { error: unknown };
    expect(body).toEqual(legacyBody);
  });

  it('rejects an unknown body field with the strict schema, naming it like parseApiInput', async () => {
    const response = await request(
      '/apps/7/deploy',
      json({ releaseId: 'r1', extra: true }),
    );
    const legacyResponse = await legacy(
      '/apps/7/deploy',
      json({ releaseId: 'r1', extra: true }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(await legacyResponse.json());
  });

  it('validates path and query parameters with nested field paths', async () => {
    const params = await request('/apps/x/deploy', json({ releaseId: 'r1' }));
    expect(params.status).toBe(400);
    expect(await params.json()).toMatchObject({
      error: {
        reason: 'INVALID_INPUT',
        fieldViolations: [{ field: 'appId', reason: 'invalid_format' }],
      },
    });

    const query = await request(
      '/apps/7/deploy?dryRun=maybe',
      json({ releaseId: 'r1' }),
    );
    expect(query.status).toBe(400);
    expect(await query.json()).toMatchObject({
      error: { fieldViolations: [{ field: 'dryRun' }] },
    });

    const nested = routerWith((router) => {
      router.post(
        '/items',
        apiValidator(
          'json',
          z.strictObject({
            items: z.array(z.strictObject({ name: z.string() })),
          }),
        ),
        (context) => context.json({ data: context.req.valid('json') }),
      );
    });
    const response = await nested('/items', json({ items: [{ name: 1 }] }));
    expect(await response.json()).toMatchObject({
      error: { fieldViolations: [{ field: 'items.0.name' }] },
    });
  });

  it('answers malformed JSON as Hono validator does', async () => {
    const response = await request('/apps/7/deploy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { status: 'INVALID_ARGUMENT', domain: 'app' },
    });
  });
});

describe('response helpers', () => {
  it('describes { data }, { data, meta }, empty and error responses in the document', async () => {
    const router = new Hono();
    router.post(
      '/hub/apps/:appId/deploy',
      describeRoute({
        tags: ['Hub'],
        summary: 'Deploy an app',
        operationId: 'hubDeployApp',
        responses: {
          '200': dataResponse(Deployment, 'The deployment.'),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
          '409': apiErrorResponse(409, 'A deployment is already running.'),
        },
      }),
      apiValidator('param', z.object({ appId: z.string() })),
      apiValidator('json', DeployInput),
      (context) => context.json({ data: null }),
    );
    router.get(
      '/hub/apps',
      describeRoute({
        tags: ['Hub'],
        summary: 'List apps',
        operationId: 'hubListApps',
        responses: {
          '200': listResponse(
            z.object({ id: z.string() }),
            z.object({ total: z.number().int(), nextPageToken: z.string() }),
          ),
        },
      }),
      (context) => context.json({ data: [], meta: { total: 0 } }),
    );
    router.delete(
      '/hub/apps/:appId',
      describeRoute({
        tags: ['Hub'],
        summary: 'Delete an app',
        operationId: 'hubDeleteApp',
        responses: {
          '204': emptyResponse(),
          '200': listResponse({ type: 'string' }),
        },
      }),
      (context) => context.body(null, 204),
    );

    const document = await generateApiDocument(router, {
      info: { title: 'Test', version: '1.0.0' },
    });

    const deploy = document.paths!['/api/hub/apps/{appId}/deploy']!.post!;
    expect(deploy.responses!['200']).toEqual({
      description: 'The deployment.',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['data'],
            properties: {
              data: { $ref: '#/components/schemas/HubDeployment' },
            },
          },
        },
      },
    });
    expect(document.components!.schemas!.HubDeployment).toMatchObject({
      type: 'object',
      properties: { id: { type: 'string' }, releaseId: { type: 'string' } },
    });
    expect(deploy.responses!['400']).toEqual({
      $ref: '#/components/responses/BadRequest',
    });
    expect(deploy.responses!['404']).toEqual({
      $ref: '#/components/responses/NotFound',
    });
    expect(deploy.responses!['409']).toEqual({
      description: 'A deployment is already running.',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiErrorBody' },
        },
      },
    });
    expect(document.components!.responses!.NotFound).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiErrorBody' },
        },
      },
    });

    const list = document.paths!['/api/hub/apps']!.get!.responses!['200'] as {
      content: Record<string, { schema: unknown }>;
    };
    expect(list.content['application/json']!.schema).toMatchObject({
      required: ['data', 'meta'],
      properties: {
        data: {
          type: 'array',
          items: { properties: { id: { type: 'string' } } },
        },
        meta: {
          properties: {
            total: { type: 'integer' },
            nextPageToken: { type: 'string' },
          },
        },
      },
    });

    const remove = document.paths!['/api/hub/apps/{appId}']!.delete!;
    expect(remove.responses!['204']).toEqual({ description: 'No content.' });
    expect(
      (
        remove.responses!['200'] as {
          content: Record<string, { schema: unknown }>;
        }
      ).content['application/json']!.schema,
    ).toMatchObject({
      properties: {
        data: { items: { type: 'string' } },
        meta: { $ref: '#/components/schemas/ApiListMeta' },
      },
    });
  });
});
