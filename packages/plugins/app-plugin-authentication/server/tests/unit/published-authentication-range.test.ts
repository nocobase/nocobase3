// @vitest-environment node

import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import metadata from '../../../package.json' with { type: 'json' };

it('uses a Better Auth range compatible with the immutable account schema', () => {
  expect(metadata.dependencies['better-auth']).toBe('catalog:');
  const catalog = readFileSync(
    new URL('../../../../../../pnpm-workspace.yaml', import.meta.url),
    'utf8',
  );
  // Better Auth 1.7.3 removes the required issuer field from account writes.
  expect(catalog).toContain("  better-auth: '>=1.7.1 <1.7.3'");
});
