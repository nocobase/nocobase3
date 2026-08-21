// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { HubApiError } from '@/features/hub/api';
import { createHubAuthRuntime } from '@/features/hub/runtime';

describe('Hub authentication runtime', () => {
  it('uses the self-contained Better Auth endpoints under the injected Hub API', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          user: {
            id: 'user-1',
            name: 'Hub Owner',
            email: 'owner@example.com',
          },
          session: { id: 'session-1', expiresAt: '2026-09-01T00:00:00.000Z' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const runtime = createHubAuthRuntime({
      baseURL: '/hub/api',
      fetcher,
    });

    await expect(
      runtime.authProvider.login({
        identifier: 'owner@example.com',
        password: 'correct horse battery staple',
      }),
    ).resolves.toMatchObject({ success: true, redirectTo: '/' });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/hub/api/auth/sign-in/email');
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({
      email: 'owner@example.com',
      password: 'correct horse battery staple',
    });
    expect(requests[0].init?.credentials).toBe('include');
  });

  it('does not expose public registration through the Refine provider', () => {
    const runtime = createHubAuthRuntime({
      baseURL: '/hub/api',
      fetcher: vi.fn<typeof fetch>(),
    });

    expect(runtime.authProvider.register).toBeUndefined();
    expect(runtime.authProvider.forgotPassword).toBeUndefined();
  });

  it('sends JSON content type when signing out', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const runtime = createHubAuthRuntime({
      baseURL: '/hub/api',
      fetcher,
    });

    await expect(runtime.client.signOut()).resolves.toBeUndefined();

    expect(requests[0].url).toBe('/hub/api/auth/sign-out');
    expect(new Headers(requests[0].init?.headers).get('content-type')).toBe(
      'application/json',
    );
    expect(requests[0].init?.body).toBe('{}');
  });

  it('revalidates a cached session and clears it after a Hub API 401', async () => {
    let sessionRequests = 0;
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/auth/get-session')) {
        sessionRequests += 1;
        return new Response(
          JSON.stringify(
            sessionRequests === 1
              ? {
                  user: {
                    id: 'user-1',
                    name: 'Hub Owner',
                    email: 'owner@example.com',
                  },
                  session: {
                    id: 'session-1',
                    expiresAt: '2026-09-01T00:00:00.000Z',
                  },
                }
              : null,
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const runtime = createHubAuthRuntime({ baseURL: '/hub/api', fetcher });

    await expect(runtime.authProvider.check()).resolves.toMatchObject({
      authenticated: true,
    });
    await runtime.authProvider.onError?.(
      new HubApiError('Session expired', {
        code: 'UNAUTHORIZED',
        status: 401,
      }),
    );
    await expect(runtime.authProvider.check()).resolves.toMatchObject({
      authenticated: false,
      redirectTo: '/login',
    });
    expect(sessionRequests).toBe(2);
  });
});
