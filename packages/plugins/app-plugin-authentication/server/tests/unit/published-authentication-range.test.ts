// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import metadata from '../../../package.json' with { type: 'json' };

it('publishes a Better Auth range compatible with the immutable account schema', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'authentication-range-'));
  const archive = join(directory, 'authentication.tgz');
  const pnpm = process.env.npm_execpath;
  if (!pnpm) throw new Error('Run this package test through pnpm.');
  try {
    execFileSync(process.execPath, [pnpm, 'pack', '--out', archive], {
      cwd: fileURLToPath(new URL('../../../', import.meta.url)),
      stdio: 'pipe',
    });
    const published = JSON.parse(
      execFileSync('tar', ['-xOf', archive, 'package/package.json'], {
        encoding: 'utf8',
      }),
    ) as {
      name: string;
      version: string;
      dependencies: Record<string, string>;
    };
    expect(published.name).toBe(metadata.name);
    expect(published.version).toBe(metadata.version);
    // Better Auth 1.7.3 removes the required issuer field from account writes.
    expect(published.dependencies['better-auth']).toBe('>=1.7.1 <1.7.3');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
