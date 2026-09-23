import { AuthorizationRouteRegistry } from '@nocobase/authorization/core';
import { describe, expect, it } from 'vitest';

describe('authorization route registry', () => {
  it('refuses a path another plugin already registered', () => {
    const routes = new AuthorizationRouteRegistry();
    const handler = (): Promise<Response> =>
      Promise.resolve(new Response(null, { status: 204 }));
    routes.add('/sharing-rules', handler);

    expect(() => routes.add('/sharing-rules', handler)).toThrow(
      'Authorization route already registered: /sharing-rules',
    );
  });

  it('dispatches by path and answers nothing for a path nobody claims', async () => {
    const routes = new AuthorizationRouteRegistry();
    routes.add('/sharing-rules', (input) =>
      Promise.resolve(Response.json({ url: input.request.url })),
    );
    const request = (path: string): Request =>
      new Request(`http://app/api/authz${path}`);
    const authorization = { require: () => Promise.resolve() };

    const matched = routes.handle({
      request: request('/sharing-rules/orders'),
      path: '/sharing-rules/orders',
      authorization,
    });
    expect(await (await matched!).json()).toEqual({
      url: 'http://app/api/authz/sharing-rules/orders',
    });
    expect(
      routes.handle({
        request: request('/restriction-rules'),
        path: '/restriction-rules',
        authorization,
      }),
    ).toBeUndefined();
  });
});
