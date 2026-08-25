import { describe, expect, it } from 'vitest';

import {
  resolvePublicAppUrl,
  resolvePublicAuthBaseUrl,
} from '../src/support/paths.js';

describe('resolvePublicAppUrl', () => {
  it('joins the gateway base and App base path', () => {
    expect(
      resolvePublicAppUrl('https://apps.example.com/runtime/', '/orders'),
    ).toBe('https://apps.example.com/runtime/orders');
  });

  it('resolves the public origin for an internal authentication handler', () => {
    expect(resolvePublicAuthBaseUrl('http://127.0.0.1:13001/runtime/')).toBe(
      'http://127.0.0.1:13001',
    );
  });

  it('returns undefined when no public URL is configured', () => {
    expect(resolvePublicAppUrl(undefined, '/orders')).toBeUndefined();
  });

  it('rejects credentials and unsupported protocols', () => {
    expect(() =>
      resolvePublicAppUrl('https://user:secret@example.com', '/orders'),
    ).toThrow('without embedded credentials');
    expect(() => resolvePublicAppUrl('file:///tmp/apps', '/orders')).toThrow(
      'must use HTTP(S)',
    );
  });
});
