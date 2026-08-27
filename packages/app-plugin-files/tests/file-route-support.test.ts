import { describe, expect, it, vi } from 'vitest';

import { mountScopedFileRoutes } from '../server/internal/file-route-support.js';
import { invalidFileRoute } from '../server/internal/route-errors.js';

describe('scoped file route mounting', () => {
  it('mounts the shared route matrix and preserves method-specific handlers', async () => {
    const calls: string[] = [];
    const handler = (name: string) => async (): Promise<Response> => {
      calls.push(name);
      return new Response(name);
    };
    const routes = mountScopedFileRoutes({
      list: handler('list'),
      create: handler('create'),
      upload: handler('upload'),
      cancel: handler('cancel'),
      complete: handler('complete'),
      content: handler('content'),
      remove: handler('remove'),
      enablePublicAccess: handler('enable-public-access'),
      resetPublicAccess: handler('reset-public-access'),
      disablePublicAccess: handler('disable-public-access'),
    });

    for (const [method, path, expected] of [
      ['GET', '/', 'list'],
      ['POST', '/', 'create'],
      ['PUT', '/file-1/upload', 'upload'],
      ['DELETE', '/file-1/upload', 'cancel'],
      ['POST', '/file-1/complete', 'complete'],
      ['GET', '/file-1/content', 'content'],
      ['HEAD', '/file-1/content', 'content'],
      ['DELETE', '/file-1', 'remove'],
      ['POST', '/file-1/public-access', 'enable-public-access'],
      ['POST', '/file-1/public-access/reset', 'reset-public-access'],
      ['DELETE', '/file-1/public-access', 'disable-public-access'],
    ] as const) {
      const response = await routes.request(path, { method });
      expect(response.status).toBe(200);
      expect(calls.at(-1)).toBe(expected);
    }
  });

  it('omits public access routes and applies schema errors before handlers', async () => {
    const list = vi.fn(async (): Promise<Response> => new Response('list'));
    const routes = mountScopedFileRoutes(
      {
        list,
        create: list,
        upload: list,
        cancel: list,
        complete: list,
        content: list,
        remove: list,
      },
      Promise.resolve(invalidFileRoute('Invalid scoped route schema.')),
    );

    const response = await routes.request('/');
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      code: 'FILE_ROUTE_INVALID',
      error: 'Invalid scoped route schema.',
    });
    expect(list).not.toHaveBeenCalled();
    expect(
      (await routes.request('/file-1/public-access', { method: 'POST' }))
        .status,
    ).toBe(404);
  });
});
