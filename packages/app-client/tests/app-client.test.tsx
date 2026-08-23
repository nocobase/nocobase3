import { describe, expect, it } from 'vitest';

import { defineAppClient, normalizeAppClientBasename } from '../src/index.js';

describe('app client', () => {
  it('normalizes router basenames', () => {
    expect(normalizeAppClientBasename(undefined)).toBeUndefined();
    expect(normalizeAppClientBasename('/')).toBeUndefined();
    expect(normalizeAppClientBasename('/portal/')).toBe('/portal');
  });

  it('preserves the explicit application configuration', () => {
    const config = defineAppClient({
      basename: '/portal/',
      routes: 'Application content',
    });

    expect(config).toMatchObject({
      basename: '/portal/',
      routes: 'Application content',
    });
  });
});
