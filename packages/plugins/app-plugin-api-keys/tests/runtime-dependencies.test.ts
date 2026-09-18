// @vitest-environment node

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { expect, it } from 'vitest';

import metadata from '../package.json' with { type: 'json' };

it('provides the upstream API Key runtime peers when deployments disable automatic peer installation', () => {
  const require = createRequire(import.meta.url);
  const entry = require.resolve('@better-auth/api-key');
  const upstream = JSON.parse(
    readFileSync(resolve(dirname(entry), '../package.json'), 'utf8'),
  ) as {
    peerDependencies: Record<string, string>;
    peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  };

  // Better Auth can keep its own dependencies nested. Its presence does not
  // make those packages resolvable by the sibling API Key package.
  for (const peer of Object.keys(upstream.peerDependencies)) {
    if (upstream.peerDependenciesMeta?.[peer]?.optional) continue;
    expect(
      metadata.dependencies,
      `Missing runtime peer: ${peer}`,
    ).toHaveProperty(peer);
  }
});
