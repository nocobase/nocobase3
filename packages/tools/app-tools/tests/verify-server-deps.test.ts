// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const scriptPath = path.resolve(
  import.meta.dirname,
  '../src/scripts/utils/verify-server-deps.mjs',
);
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

interface Fixture {
  /** The application's own manifest. */
  readonly root: Record<string, unknown>;
  /** What `build-server-dist-package.mjs` generated, or `undefined` to leave `dist/package.json` out. */
  readonly dist?: Record<string, unknown>;
  /** Source files by path relative to the application root. */
  readonly sources: Record<string, string>;
  /** Packages present in `dist/node_modules`, each with the number of files to create. */
  readonly installed?: Record<string, number>;
  readonly withoutNodeModules?: boolean;
}

function write(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, ...relativePath.split('/'));
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function verify(fixture: Fixture) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nocobase-verify-deps-'));
  temporaryDirectories.push(root);
  write(root, 'package.json', JSON.stringify(fixture.root));
  if (fixture.dist) {
    write(root, 'dist/package.json', JSON.stringify(fixture.dist));
  }
  if (!fixture.withoutNodeModules) {
    mkdirSync(path.join(root, 'dist', 'node_modules'), { recursive: true });
  }
  for (const [name, files] of Object.entries(fixture.installed ?? {})) {
    write(root, `dist/node_modules/${name}/package.json`, '{}');
    for (let index = 1; index < files; index += 1) {
      write(root, `dist/node_modules/${name}/file-${index}.js`, '');
    }
  }
  for (const [file, content] of Object.entries(fixture.sources)) {
    write(root, file, content);
  }
  return spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NOCOBASE_TOOL_ROOT: root },
    timeout: 20_000,
  });
}

describe('server dependency verification', () => {
  it('passes when every runtime import is declared, generated, and installed', () => {
    const result = verify({
      root: {
        dependencies: { hono: '^4.0.0', '@scope/pkg': '^1.0.0', pg: '^8.0.0' },
        devDependencies: { vitest: '^3.0.0', typescript: '^5.0.0' },
      },
      dist: {
        dependencies: { hono: '4.0.0', '@scope/pkg': '1.0.0', pg: '8.0.0' },
      },
      installed: { hono: 3, '@scope/pkg': 2, pg: 2 },
      sources: {
        'server/index.ts': [
          `import { Hono } from 'hono';`,
          `import helper from '@scope/pkg/deep/path.js';`,
          `import fs from 'node:fs';`,
          `import path from 'path';`,
          `import { local } from './local.js';`,
          `import { alias } from '@/shared';`,
          `import { internal } from '#internal/thing';`,
          // Erased before anything runs, so a devDependency is the right place for it.
          `import type { Config } from 'vitest';`,
          `export type { Plugin } from 'typescript';`,
          `export const x = [Hono, helper, fs, path, local, alias, internal];`,
        ].join('\n'),
        'database/main/seeds/001.ts': `const { Client } = require('pg');\nexport { Client };`,
        'server/node_modules/ignored/index.ts': `import 'not-declared';`,
        'client/main.tsx': `import 'react';`,
      },
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'Verified 3 package(s) imported by server, database, and CLI code',
    );
  });

  it('fails when server code imports a devDependency', () => {
    const result = verify({
      root: {
        dependencies: { hono: '^4.0.0' },
        devDependencies: { typescript: '^5.0.0' },
      },
      dist: { dependencies: { hono: '4.0.0', typescript: '5.0.0' } },
      installed: { hono: 2, typescript: 5 },
      sources: {
        'server/loader/source-parser.ts': `import ts from 'typescript';\nexport default ts;`,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Packages your server code imports will not be usable in a deployment',
    );
    expect(result.stderr).toContain(
      `typescript — imported by server code but not in this application's "dependencies"`,
    );
    expect(result.stderr).not.toContain('hono —');
  });

  it('counts dynamic imports and re-exports as value imports', () => {
    const result = verify({
      root: { dependencies: {}, devDependencies: { sonner: '^2.0.0' } },
      dist: { dependencies: {} },
      sources: {
        'cli/index.ts': `export async function load() { return import('sonner'); }`,
        'cli/commands/index.ts': `export { toast } from 'sonner';`,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('sonner — imported by server code');
  });

  it.each([
    [
      'not listed in dist/package.json',
      { dependencies: {} },
      { pg: 2 },
      'pg — not listed in dist/package.json, so a deployment install will not fetch it',
    ],
    [
      'absent from dist/node_modules',
      { dependencies: { pg: '8.0.0' } },
      {},
      'pg — absent from dist/node_modules',
    ],
    [
      'installed as a bare manifest',
      { dependencies: { pg: '8.0.0' } },
      { pg: 1 },
      'pg — installed as a bare manifest, so nothing it exports can load',
    ],
  ])(
    'fails when a declared package is %s',
    (_case, dist, installed, message) => {
      const result = verify({
        root: { dependencies: { pg: '^8.0.0' } },
        dist,
        installed,
        sources: { 'server/db.ts': `import pg from 'pg';\nexport default pg;` },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(message);
    },
  );

  it('fails before scanning when dist/node_modules is missing', () => {
    const result = verify({
      root: { dependencies: {} },
      sources: { 'server/index.ts': '' },
      withoutNodeModules: true,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing dist/node_modules. Run pnpm build first.',
    );
  });
});
