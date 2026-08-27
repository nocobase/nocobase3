import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';

import { toFetchRequest } from '../src/http-adapter.js';

describe('App Host HTTP adapter', () => {
  it('uses the public forwarded origin and strips the App mount path', () => {
    const request = createIncomingRequest({
      host: '127.0.0.1:13010',
      'x-forwarded-host': 'apps.example.com',
      'x-forwarded-proto': 'https',
    });

    const forwarded = toFetchRequest(request, {
      basePath: '/crm',
      signal: new AbortController().signal,
    });

    expect(forwarded.url).toBe(
      'https://apps.example.com/api/auth/sign-up/email',
    );
  });

  it('falls back to the direct request host without forwarded headers', () => {
    const request = createIncomingRequest({ host: '127.0.0.1:13010' });

    const forwarded = toFetchRequest(request, {
      basePath: '/crm',
      signal: new AbortController().signal,
    });

    expect(forwarded.url).toBe('http://127.0.0.1:13010/api/auth/sign-up/email');
  });
});

function createIncomingRequest(
  headers: IncomingMessage['headers'],
): IncomingMessage {
  const request = Readable.from([]) as IncomingMessage;
  request.method = 'POST';
  request.url = '/crm/api/auth/sign-up/email';
  request.headers = headers;
  return request;
}
