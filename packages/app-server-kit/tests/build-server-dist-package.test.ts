import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildServerDistPackage,
  finalizeServerDistPackage,
} from '../scripts/build-server-dist-package.mjs';

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('server dist finalization', () => {
  it('materializes file dependencies and removes executable symlinks', () => {
    const rootDir = createDistFixture();
    const workspaceTarget = path.join(
      rootDir,
      'dist/node_modules/@example/runtime',
    );

    expect(fs.lstatSync(workspaceTarget).isSymbolicLink()).toBe(true);

    expect(finalizeServerDistPackage({ rootDir })).toEqual({
      materialized: ['@example/runtime'],
      symbolicLinks: [],
    });
    expect(fs.lstatSync(workspaceTarget).isDirectory()).toBe(true);
    expect(
      fs.readFileSync(path.join(workspaceTarget, 'index.js'), 'utf8'),
    ).toBe('export const runtime = true;\n');
    expect(
      fs.existsSync(path.join(rootDir, 'dist/node_modules/.bin/runtime')),
    ).toBe(false);

    expect(finalizeServerDistPackage({ rootDir })).toEqual({
      materialized: [],
      symbolicLinks: [],
    });

    fs.writeFileSync(
      path.join(rootDir, 'dist/vendor/@example/runtime/index.js'),
      'export const runtime = false;\n',
    );
    fs.writeFileSync(
      path.join(workspaceTarget, 'stale.js'),
      'export const stale = true;\n',
    );
    expect(finalizeServerDistPackage({ rootDir })).toEqual({
      materialized: ['@example/runtime'],
      symbolicLinks: [],
    });
    expect(
      fs.readFileSync(path.join(workspaceTarget, 'index.js'), 'utf8'),
    ).toBe('export const runtime = false;\n');
    expect(fs.existsSync(path.join(workspaceTarget, 'stale.js'))).toBe(false);

    expect(finalizeServerDistPackage({ rootDir })).toEqual({
      materialized: [],
      symbolicLinks: [],
    });
  });

  it('rejects file dependencies that escape dist', () => {
    const rootDir = createDistFixture();
    const packagePath = path.join(rootDir, 'dist/package.json');
    fs.writeFileSync(
      packagePath,
      JSON.stringify({
        dependencies: { '@example/runtime': 'file:../../outside' },
      }),
    );

    expect(() => finalizeServerDistPackage({ rootDir })).toThrow(
      /must stay inside/,
    );
  });
});

describe('server dist package generation', () => {
  it('vendors configured plugins and preserves plugin runtime metadata', () => {
    const rootDir = createBuildFixture();

    expect(buildServerDistPackage({ rootDir })).toMatchObject({
      dependencies: expect.arrayContaining([
        '@example/app-plugin-audit',
        'external-runtime',
      ]),
      workspacePackages: ['@example/app-plugin-audit'],
    });

    const distPackage = readJson(path.join(rootDir, 'dist/package.json'));
    expect(distPackage).toMatchObject({
      nocobase: {
        plugins: {
          '@example/app-plugin-audit': { enabled: true },
        },
      },
      scripts: {
        start: 'node ./server/standalone.js',
        migrate: 'node ./scripts/migrate.js',
        seed: 'node ./scripts/seed.js',
      },
      dependencies: {
        '@example/app-plugin-audit': 'file:vendor/@example/app-plugin-audit',
        'external-runtime': '1.2.3',
      },
    });

    const vendoredPackage = readJson(
      path.join(rootDir, 'dist/vendor/@example/app-plugin-audit/package.json'),
    );
    expect(vendoredPackage).toMatchObject({
      name: '@example/app-plugin-audit',
      displayName: 'Audit plugin',
      description: 'Test plugin metadata.',
      nocobase: {
        plugin: {
          database: {
            migrations: './database/migrations',
            seeds: './database/seeds',
          },
        },
      },
    });
  });
});

function createDistFixture(): string {
  const rootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'nocobase-server-dist-'),
  );
  tempDirs.push(rootDir);

  const distDir = path.join(rootDir, 'dist');
  const vendorDir = path.join(distDir, 'vendor/@example/runtime');
  const scopeDir = path.join(distDir, 'node_modules/@example');
  const binDir = path.join(distDir, 'node_modules/.bin');
  fs.mkdirSync(vendorDir, { recursive: true });
  fs.mkdirSync(scopeDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    path.join(vendorDir, 'index.js'),
    'export const runtime = true;\n',
  );
  fs.writeFileSync(
    path.join(distDir, 'package.json'),
    JSON.stringify({
      dependencies: { '@example/runtime': 'file:vendor/@example/runtime' },
    }),
  );
  fs.symlinkSync(
    '../../vendor/@example/runtime',
    path.join(scopeDir, 'runtime'),
  );
  fs.symlinkSync(
    '../../vendor/@example/runtime/index.js',
    path.join(binDir, 'runtime'),
  );
  return rootDir;
}

function createBuildFixture(): string {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'nocobase-server-build-'),
  );
  tempDirs.push(workspaceRoot);
  const rootDir = path.join(workspaceRoot, 'apps/example');
  const pluginDir = path.join(workspaceRoot, 'packages/app-plugin-audit');
  fs.mkdirSync(path.join(rootDir, 'dist/server'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'dist/scripts'), { recursive: true });
  fs.mkdirSync(path.join(pluginDir, 'dist'), { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, 'pnpm-workspace.yaml'),
    'packages:\n  - packages/*\n  - apps/*\n',
  );
  fs.writeFileSync(
    path.join(workspaceRoot, 'package.json'),
    JSON.stringify({ name: '@example/workspace', engines: { node: '>=24' } }),
  );
  fs.writeFileSync(
    path.join(rootDir, 'package.json'),
    JSON.stringify({
      name: '@example/app',
      version: '1.0.0',
      type: 'module',
      nocobase: {
        plugins: {
          '@example/app-plugin-audit': { enabled: true },
        },
      },
      devDependencies: {
        '@example/app-plugin-audit': 'workspace:^',
      },
    }),
  );
  fs.writeFileSync(
    path.join(pluginDir, 'package.json'),
    JSON.stringify({
      name: '@example/app-plugin-audit',
      displayName: 'Audit plugin',
      description: 'Test plugin metadata.',
      version: '1.0.0',
      type: 'module',
      dependencies: { 'external-runtime': '^1.2.3' },
      nocobase: {
        plugin: {
          database: {
            migrations: './database/migrations',
            seeds: './database/seeds',
          },
        },
      },
    }),
  );
  fs.writeFileSync(
    path.join(pluginDir, 'dist/index.js'),
    'export const plugin = true;\n',
  );
  fs.writeFileSync(
    path.join(rootDir, 'dist/server/embedded.js'),
    'export default function createServer() {}\n',
  );
  fs.writeFileSync(
    path.join(rootDir, 'dist/scripts/migrate.js'),
    'export const migrate = true;\n',
  );
  fs.writeFileSync(
    path.join(rootDir, 'dist/scripts/seed.js'),
    'export const seed = true;\n',
  );
  return rootDir;
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
}
