// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  resolvePublicPath,
  toPublicRequest,
} from '../../server/runtime/public-request.ts';

describe('public request path', () => {
  it('resolves full public paths from app-local paths', () => {
    expect(resolvePublicPath('/api/auth', '/main')).toBe('/main/api/auth');
    expect(resolvePublicPath('/api/auth', '')).toBe('/api/auth');
    expect(resolvePublicPath('/', '/main')).toBe('/main/');
  });

  it('keeps a request unchanged for an app mounted at the origin root', () => {
    const request = new Request('http://localhost/api/auth/get-session');

    expect(toPublicRequest(request, '')).toBe(request);
  });

  it('restores the full public path and preserves request data', async () => {
    const request = new Request(
      'http://localhost/api/auth/sign-in/username?from=login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test': 'value' },
        body: JSON.stringify({ username: 'admin' }),
        duplex: 'half',
      },
    );

    const publicRequest = toPublicRequest(request, '/main');

    expect(publicRequest.url).toBe(
      'http://localhost/main/api/auth/sign-in/username?from=login',
    );
    expect(publicRequest.method).toBe('POST');
    expect(publicRequest.headers.get('x-test')).toBe('value');
    await expect(publicRequest.json()).resolves.toEqual({ username: 'admin' });
  });
});
