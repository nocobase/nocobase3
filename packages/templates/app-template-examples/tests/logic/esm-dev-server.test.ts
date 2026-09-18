// @vitest-environment node
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('isolates the watched server from the full tsx CommonJS transform', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const fixture = mkdtempSync(path.join(tmpdir(), 'esm-dev-server-'));
  try {
    mkdirSync(path.join(fixture, 'server'));
    symlinkSync(
      path.join(root, 'node_modules'),
      path.join(fixture, 'node_modules'),
      'dir',
    );
    writeFileSync(
      path.join(fixture, 'package.json'),
      JSON.stringify({ type: 'module' }),
    );
    writeFileSync(path.join(fixture, 'tsconfig.server.json'), '{}');
    writeFileSync(
      path.join(fixture, 'server/standalone.ts'),
      `
      import assert from 'node:assert/strict';
      import { resolveDatabaseDriver } from '@nocobase/db';
      const driver = resolveDatabaseDriver({ dialect: 'sqlite' });
      const imported = await import('@nocobase/db-sqlite');
      assert.equal(driver, imported.default.driver);
      console.log('shared-esm-identity');
    `,
    );
    const output = execFileSync(
      process.execPath,
      [
        '--import',
        createRequire(import.meta.url).resolve('tsx'),
        path.join(root, 'scripts/dev/server.mjs'),
      ],
      {
        cwd: fixture,
        encoding: 'utf8',
        env: { ...process.env, NODE_OPTIONS: '' },
        timeout: 15_000,
      },
    );
    expect(output.trim()).toBe('shared-esm-identity');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
