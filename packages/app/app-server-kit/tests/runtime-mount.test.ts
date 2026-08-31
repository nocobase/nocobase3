import type { ExecutionContext } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import {
  createPublicBasePathAdapter,
  stripPublicBasePathFromRequest,
} from '../src/runtime/index.js';

describe('public base path adapter', () => {
  it('returns the original server when no public base path is configured', () => {
    const server = createTestServer();

    expect(createPublicBasePathAdapter(server, '')).toBe(server);
    expect(createPublicBasePathAdapter(server, '/')).toBe(server);
  });

  it.each([
    ['/main', '/'],
    ['/main/', '/'],
    ['/main/settings?tab=apps', '/settings?tab=apps'],
  ])(
    'maps mounted request %s to app-local path %s',
    async (input, expected) => {
      const fetch = vi.fn((request: Request) =>
        Response.json({
          url: new URL(request.url).pathname + new URL(request.url).search,
        }),
      );
      const mounted = createPublicBasePathAdapter({ fetch }, '/main');

      const response = await mounted.fetch(
        new Request(`http://localhost${input}`),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ url: expected });
    },
  );

  it('rejects requests outside the public base path without dispatching them', async () => {
    const server = createTestServer();
    const mounted = createPublicBasePathAdapter(server, '/main');

    const response = await mounted.fetch(new Request('http://localhost/other'));

    expect(response.status).toBe(404);
    expect(server.fetch).not.toHaveBeenCalled();
  });

  it('preserves the host fetch context and restores the base path on redirects', async () => {
    const env = { deployment: 'test' };
    const executionContext = {} as ExecutionContext;
    const fetch = vi.fn(
      (
        _request: Request,
        receivedEnv?: unknown,
        receivedExecutionContext?: ExecutionContext,
      ) => {
        expect(receivedEnv).toBe(env);
        expect(receivedExecutionContext).toBe(executionContext);
        return new Response(null, {
          status: 302,
          headers: { location: '/install' },
        });
      },
    );
    const mounted = createPublicBasePathAdapter({ fetch }, '/main');

    const response = await mounted.fetch(
      new Request('http://localhost/main/login'),
      env,
      executionContext,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/main/install');
  });

  it('preserves POST bodies and query strings when stripping the base path', async () => {
    const request = new Request('http://localhost/main/actions?dryRun=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'publish' }),
    });

    const stripped = stripPublicBasePathFromRequest(request, '/main');

    expect(stripped).not.toBeNull();
    expect(stripped?.url).toBe('http://localhost/actions?dryRun=true');
    await expect(stripped?.json()).resolves.toEqual({ action: 'publish' });
  });

  it('mounts WebSocket handling under the same public base path', async () => {
    const websocket = vi.fn((request: Request, env?: unknown) =>
      Response.json({ path: new URL(request.url).pathname, env }),
    );
    const mounted = createPublicBasePathAdapter(
      { fetch: vi.fn(), websocket },
      '/main',
    );
    const env = { runtime: 'test' };

    const bareResult = await mounted.websocket?.(
      new Request('http://localhost/ws'),
      env,
    );
    const mountedResult = await mounted.websocket?.(
      new Request('http://localhost/main/ws'),
      env,
    );

    expect(bareResult).toBeNull();
    expect(mountedResult).toBeInstanceOf(Response);
    await expect((mountedResult as Response).json()).resolves.toEqual({
      path: '/ws',
      env,
    });
    expect(websocket).toHaveBeenCalledTimes(1);
  });
});

function createTestServer() {
  return {
    fetch: vi.fn((_request: Request) => new Response('ok')),
  };
}
