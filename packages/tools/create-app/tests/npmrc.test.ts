import { describe, expect, it } from 'vitest';

import { buildNpmrcFile } from '../src/lib/npmrc.ts';

describe('buildNpmrcFile', () => {
  /**
   * Nothing else in a generated project records where NocoBase packages come from: creation passes its registry to
   * the one install it runs itself, and the next `pnpm add @nocobase/…` the user runs would resolve against the
   * public npm and fail with a 404 that never mentions a registry.
   */
  it('records a self-hosted registry for the NocoBase scope only', () => {
    const contents = buildNpmrcFile({ registry: 'https://npm.nocobase.ai' });

    expect(contents).toContain('@nocobase:registry=https://npm.nocobase.ai');
    expect(contents).not.toMatch(/^registry=/mu);
  });

  /** A pin to a mirror is worth nothing once the packages are on the public registry, and outlives its usefulness. */
  it('writes no registry line for the public npm', () => {
    const contents = buildNpmrcFile({
      registry: 'https://registry.npmjs.org/',
    });

    expect(contents).not.toContain('registry=');
  });

  /**
   * The templates carry this line in their own `.npmrc`, but npm strips that file from every tarball it builds, so
   * it never reaches a generated project.
   */
  it('always carries the peer dependency setting the templates cannot ship', () => {
    for (const registry of [
      'https://npm.nocobase.ai',
      'https://registry.npmjs.org/',
    ]) {
      expect(buildNpmrcFile({ registry })).toContain(
        'strict-peer-dependencies=false',
      );
    }
  });

  it('treats an unparseable registry as private rather than dropping it', () => {
    expect(buildNpmrcFile({ registry: 'not a url' })).toContain(
      '@nocobase:registry=not a url',
    );
  });

  it('ends with a newline', () => {
    expect(buildNpmrcFile({ registry: 'https://npm.nocobase.ai' })).toMatch(
      /\n$/u,
    );
  });
});
