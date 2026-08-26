import { describe, expect, it } from 'vitest';

import {
  addBasePathToLocation,
  addBasePathToRedirectResponse,
} from '../src/support/redirects.js';

describe('base path redirects', () => {
  it.each([
    ['/install', '/main', '/main/install'],
    ['/install?step=db', '/main', '/main/install?step=db'],
    ['/install#database', '/main', '/main/install#database'],
    ['/main/install', '/main', '/main/install'],
    ['./install', '/main', './install'],
    ['../install', '/main', '../install'],
    ['https://example.com/login', '/main', 'https://example.com/login'],
    ['//example.com/login', '/main', '//example.com/login'],
    ['/', '/main', '/main/'],
    ['/install', '', '/install'],
  ])('maps %s under %s to %s', (location, basePath, expected) => {
    expect(addBasePathToLocation(location, basePath)).toBe(expected);
  });

  it('rewrites redirects while preserving other response metadata', () => {
    const response = new Response('redirect body', {
      headers: { Location: '/install', 'X-Test': 'kept' },
      status: 302,
      statusText: 'Found',
    });

    const rewritten = addBasePathToRedirectResponse(response, '/main');

    expect(rewritten.status).toBe(302);
    expect(rewritten.statusText).toBe('Found');
    expect(rewritten.headers.get('Location')).toBe('/main/install');
    expect(rewritten.headers.get('X-Test')).toBe('kept');
  });

  it('does not rewrite non-redirect responses with a Location header', () => {
    const response = new Response(null, {
      headers: { Location: '/records/1' },
      status: 201,
    });

    expect(addBasePathToRedirectResponse(response, '/main')).toBe(response);
  });
});
