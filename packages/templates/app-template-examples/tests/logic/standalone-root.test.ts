// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { resolveStandaloneRootDir } from '../../server/standalone';

describe('standalone application root', () => {
  it('resolves both source and compiled entry layouts to the application root', () => {
    expect(resolveStandaloneRootDir('/srv/app/server')).toBe('/srv/app');
    expect(resolveStandaloneRootDir('/srv/app/dist/server')).toBe('/srv/app');
  });
});
