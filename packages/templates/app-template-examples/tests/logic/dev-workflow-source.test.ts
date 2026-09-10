// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../scripts/dev/index.mjs', import.meta.url),
  'utf8',
);
// Comments explain why the build is absent, so only executable code is examined.
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

describe('development workflow loading', () => {
  it('does not build workflow Artifacts before starting', () => {
    // The Workflow plugin compiles `server/workflows` on demand whenever the
    // runtime is not production, producing the digest a build would produce.
    // Reinstating a preflight build here would put seconds back on every start
    // and reintroduce the rebuild-and-restart loop it replaced, without making
    // anything visible that is not already visible.
    expect(code).not.toMatch(/['"]workflow['"]\s*,\s*['"]build['"]/);
    expect(code).not.toMatch(/workflow\s+build/);
    expect(code).not.toMatch(/spawn\.sync/);
  });
});
