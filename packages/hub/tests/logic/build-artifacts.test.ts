// @vitest-environment node

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const hubRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Hub production build artifacts', () => {
  it('declares the default template used by its build', () => {
    const manifest = readJson(path.join(hubRoot, 'package.json'));

    expect(manifest.devDependencies).toMatchObject({
      '@nocobase/app-template-default': 'workspace:^',
    });
  });

  it('prebuilds server workspaces and writes only non-sensitive runtime env', () => {
    const fixtureRoot = createFixtureRoot('nocobase-hub-build-');
    const fixtureHubRoot = path.join(fixtureRoot, 'packages/hub');
    const fixtureScriptsDir = path.join(fixtureHubRoot, 'scripts');
    const fakeBinDir = path.join(fixtureRoot, 'bin');
    const commandLog = path.join(fixtureRoot, 'commands.log');
    mkdirSync(fixtureScriptsDir, { recursive: true });
    mkdirSync(path.join(fixtureHubRoot, 'node_modules'), { recursive: true });
    mkdirSync(fakeBinDir, { recursive: true });
    symlinkSync(
      path.join(hubRoot, 'node_modules/cross-spawn'),
      path.join(fixtureHubRoot, 'node_modules/cross-spawn'),
    );
    copyFileSync(
      path.join(hubRoot, 'scripts/build.mjs'),
      path.join(fixtureScriptsDir, 'build.mjs'),
    );
    copyFileSync(
      path.join(hubRoot, 'scripts/build-default-app-resources.mjs'),
      path.join(fixtureScriptsDir, 'build-default-app-resources.mjs'),
    );

    const fixtureTemplateRoot = path.join(
      fixtureRoot,
      'packages/app-template-default',
    );
    mkdirSync(path.join(fixtureTemplateRoot, 'client'), { recursive: true });
    mkdirSync(path.join(fixtureTemplateRoot, 'dist/server'), {
      recursive: true,
    });
    writeJson(path.join(fixtureTemplateRoot, 'package.json'), {
      name: '@nocobase/app-template-default',
      version: '0.0.1',
    });
    writeFileSync(
      path.join(fixtureTemplateRoot, 'client/index.ts'),
      'export const defaultApp = true;\n',
    );
    writeFileSync(
      path.join(fixtureTemplateRoot, 'dist/server/embedded.js'),
      'export default async () => ({ fetch: () => Response.json({ ok: true }) });\n',
    );
    mkdirSync(path.join(fixtureTemplateRoot, 'dist/client'), {
      recursive: true,
    });
    writeFileSync(
      path.join(fixtureTemplateRoot, 'dist/client/index.html'),
      '<main>Default</main>\n',
    );

    writeFileSync(
      path.join(fixtureHubRoot, '.env'),
      [
        'APP_NAME=hub',
        'APP_BASE_PATH=/hub',
        'APP_BROWSER_BASE_PATH=/console',
        'APP_SERVER_HOST=0.0.0.0',
        'APP_SERVER_PORT=14000',
        'HUB_ENABLED=true',
        'HUB_DATABASE_PATH=./storage/hub.sqlite',
        'HUB_RELEASE_ROOT=./releases',
        'APP_PUBLIC_ORIGIN=http://127.0.0.1:3000',
        'HUB_MAX_UPLOAD_BYTES=536870912',
        'HUB_MAX_ARTIFACT_BYTES=2147483648',
        'HUB_UPLOAD_TTL_SECONDS=86400',
        'API_CLIENT_STORAGE_PREFIX=HUB_',
        'API_CLIENT_STORAGE_TYPE=localStorage',
        'API_CLIENT_SHARE_TOKEN=true',
        'NOCOBASE_API_PROXY_TARGET=http://127.0.0.1:13000/api',
        'NOCOBASE_API_PROXY_PATH=/legacy-api',
        'AUTH_BASE_URL=http://127.0.0.1:14000/hub/api/auth',
      ].join('\n'),
    );
    writeFileSync(
      path.join(fixtureHubRoot, '.env.local'),
      [
        'APP_SERVER_PORT=14001',
        'AUTH_SECRET=do-not-package-this-secret',
        'DB_PASSWORD=do-not-package-this-password',
        'DEPLOY_TOKEN=do-not-package-this-token',
        'SERVICE_CREDENTIALS=do-not-package-these-credentials',
        'HUB_SECRET_ENCRYPTION_KEY=do-not-package-this-key',
        'APP_SERVER_START_LOG=${AUTH_SECRET}',
        'AUTH_BASE_URL=http://deploy:credential@127.0.0.1:14000/hub/api/auth',
        'NOCOBASE_WS_URL=ws://127.0.0.1:13000/ws',
      ].join('\n'),
    );

    for (const command of ['node', 'npm', 'pnpm']) {
      writeExecutable(
        path.join(fakeBinDir, command),
        [
          '#!/bin/sh',
          'printf "APP_BASE_PATH=%s APP_BROWSER_BASE_PATH=%s %s\\n" "$APP_BASE_PATH" "$APP_BROWSER_BASE_PATH" "$0 $*" >> "$BUILD_COMMAND_LOG"',
          '',
        ].join('\n'),
      );
    }

    const result = spawnSync(
      process.execPath,
      [path.join(fixtureScriptsDir, 'build.mjs')],
      {
        cwd: fixtureHubRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          APP_BASE_PATH: '/runtime-hub',
          APP_BROWSER_BASE_PATH: '/runtime-console',
          BUILD_COMMAND_LOG: commandLog,
          PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`,
        },
      },
    );

    assertCommandSucceeded(result);
    expect(readFileSync(path.join(fixtureHubRoot, 'dist/.env'), 'utf8')).toBe(
      [
        'APP_NAME=hub',
        'APP_BASE_PATH=/runtime-hub',
        'APP_BROWSER_BASE_PATH=/runtime-console',
        'APP_SERVER_HOST=0.0.0.0',
        'APP_SERVER_PORT=14001',
        'HUB_ENABLED=true',
        'HUB_DATABASE_PATH=./storage/hub.sqlite',
        'HUB_RELEASE_ROOT=./releases',
        'APP_PUBLIC_ORIGIN=http://127.0.0.1:3000',
        'HUB_MAX_UPLOAD_BYTES=536870912',
        'HUB_MAX_ARTIFACT_BYTES=2147483648',
        'HUB_UPLOAD_TTL_SECONDS=86400',
        'API_CLIENT_STORAGE_PREFIX=HUB_',
        'API_CLIENT_STORAGE_TYPE=localStorage',
        'API_CLIENT_SHARE_TOKEN=true',
        'NOCOBASE_API_PROXY_TARGET=http://127.0.0.1:13000/api',
        'NOCOBASE_API_PROXY_PATH=/legacy-api',
        '',
      ].join('\n'),
    );
    expect(statSync(path.join(fixtureHubRoot, 'dist/.env')).mode & 0o777).toBe(
      0o600,
    );

    const commands = readFileSync(commandLog, 'utf8');
    expect(commands).toContain('pnpm --filter @nocobase/app-host');
    expect(commands).toContain('--filter @nocobase/app-server-kit');
    expect(commands).toContain('--filter @nocobase/app-sdk');
    expect(commands).toContain('--filter @nocobase/app-portal-sdk');
    expect(commands).toContain('--filter @nocobase/app-plugin-authentication');
    expect(commands).toContain('--filter @nocobase/caching');
    expect(commands).toContain('--filter @nocobase/app-database');
    const defaultAppBuild = commands
      .split(/\r?\n/)
      .find((command) =>
        command.includes('--filter @nocobase/app-template-default build'),
      );
    expect(defaultAppBuild).toContain(
      'APP_BASE_PATH=/default APP_BROWSER_BASE_PATH=/default',
    );
    expect(commands).toContain('./scripts/build-default-app-resources.mjs');
    expect(commands).toContain('--build-dir');
    expect(commands).toContain('dist/resources/default-app');
    expect(commands).not.toContain('npm install');
    expect(commands).not.toContain('./scripts/clean-dist-bin.mjs');
  });

  it.each([
    [
      'username',
      'AUTH_BASE_URL=http://deploy@127.0.0.1:14000/hub/api/auth',
      'AUTH_BASE_URL',
    ],
    [
      'password',
      'AUTH_BASE_URL=http://:credential@127.0.0.1:14000/hub/api/auth',
      'AUTH_BASE_URL',
    ],
    [
      'query',
      'NOCOBASE_API_PROXY_TARGET=http://127.0.0.1:13000/api?token=secret',
      'NOCOBASE_API_PROXY_TARGET',
    ],
    [
      'empty query',
      'NOCOBASE_API_PROXY_TARGET="http://127.0.0.1:13000/api?"',
      'NOCOBASE_API_PROXY_TARGET',
    ],
    [
      'fragment',
      'NOCOBASE_API_PROXY_TARGET="http://127.0.0.1:13000/api#secret"',
      'NOCOBASE_API_PROXY_TARGET',
    ],
    [
      'empty fragment',
      'NOCOBASE_API_PROXY_TARGET="http://127.0.0.1:13000/api#"',
      'NOCOBASE_API_PROXY_TARGET',
    ],
  ])('does not package URL %s data', (_kind, entry, key) => {
    const distEnv = buildFixtureDistEnv(entry);

    expect(distEnv).toBe('APP_NAME=hub\n');
    expect(distEnv).not.toContain(`${key}=`);
  });

  it('uses registry versions for workspace and SQLite runtime dependencies', () => {
    const fixtureRoot = createFixtureRoot('nocobase-hub-dist-package-');
    const packagesRoot = path.join(fixtureRoot, 'packages');
    const fixtureHubRoot = path.join(packagesRoot, 'hub');
    const fixtureScriptsDir = path.join(fixtureHubRoot, 'scripts');
    mkdirSync(path.join(fixtureHubRoot, 'dist/server'), { recursive: true });
    mkdirSync(fixtureScriptsDir, { recursive: true });
    copyFileSync(
      path.join(hubRoot, 'scripts/build-server-dist-package.mjs'),
      path.join(fixtureScriptsDir, 'build-server-dist-package.mjs'),
    );

    writeJson(path.join(fixtureHubRoot, 'package.json'), {
      name: '@nocobase/hub',
      version: '1.0.0',
      type: 'module',
      engines: { node: '>=24.0.0' },
      devDependencies: {
        'better-sqlite3': '12.11.1',
        knex: '3.1.0',
      },
    });
    writeFileSync(
      path.join(fixtureHubRoot, 'dist/server/standalone.js'),
      'import { feature } from "@nocobase/feature";\nexport { feature };\n',
    );
    createWorkspacePackage(packagesRoot, 'feature', {
      name: '@nocobase/feature',
      version: '1.0.0',
      type: 'module',
      main: './src/index.ts',
      exports: { '.': './src/index.ts' },
      publishConfig: { exports: { '.': './dist/index.js' } },
      dependencies: { '@nocobase/app-database': 'workspace:^' },
    });
    createWorkspacePackage(packagesRoot, 'app-database', {
      name: '@nocobase/app-database',
      version: '1.0.0',
      type: 'module',
      main: './dist/index.js',
      exports: { '.': './src/index.ts' },
      publishConfig: { exports: { '.': './dist/index.js' } },
      dependencies: { knex: '3.1.0' },
    });

    const result = spawnSync(
      process.execPath,
      [path.join(fixtureScriptsDir, 'build-server-dist-package.mjs')],
      { cwd: fixtureHubRoot, encoding: 'utf8' },
    );

    assertCommandSucceeded(result);
    const distPackage = readJson(
      path.join(fixtureHubRoot, 'dist/package.json'),
    );
    expect(distPackage.dependencies).toMatchObject({
      '@nocobase/feature': '1.0.0',
      'better-sqlite3': '12.11.1',
      knex: '3.1.0',
    });
    expect(distPackage.dependencies).not.toHaveProperty(
      '@nocobase/app-database',
    );
    expect(distPackage).not.toHaveProperty('private');
    expect(distPackage.files).toEqual([
      'client',
      'server',
      'resources/default-app',
    ]);
    expect(distPackage.publishConfig).toEqual({ access: 'public' });
    expect(
      readFileSync(path.join(fixtureHubRoot, 'dist/package.json'), 'utf8'),
    ).not.toContain('file:vendor');
  });
});

function createFixtureRoot(prefix: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

function buildFixtureDistEnv(entry: string): string {
  const fixtureRoot = createFixtureRoot('nocobase-hub-build-url-safety-');
  const fixtureHubRoot = path.join(fixtureRoot, 'packages/hub');
  const fixtureScriptsDir = path.join(fixtureHubRoot, 'scripts');
  const fakeBinDir = path.join(fixtureRoot, 'bin');
  mkdirSync(fixtureScriptsDir, { recursive: true });
  mkdirSync(path.join(fixtureHubRoot, 'node_modules'), { recursive: true });
  mkdirSync(fakeBinDir, { recursive: true });
  symlinkSync(
    path.join(hubRoot, 'node_modules/cross-spawn'),
    path.join(fixtureHubRoot, 'node_modules/cross-spawn'),
  );
  copyFileSync(
    path.join(hubRoot, 'scripts/build.mjs'),
    path.join(fixtureScriptsDir, 'build.mjs'),
  );
  writeJson(
    path.join(fixtureRoot, 'packages/app-template-default/package.json'),
    {
      name: '@nocobase/app-template-default',
      version: '0.0.1',
    },
  );
  writeFileSync(
    path.join(fixtureHubRoot, '.env'),
    ['APP_NAME=hub', entry].join('\n'),
  );

  for (const command of ['node', 'npm', 'pnpm']) {
    writeExecutable(path.join(fakeBinDir, command), '#!/bin/sh\nexit 0\n');
  }

  const result = spawnSync(
    process.execPath,
    [path.join(fixtureScriptsDir, 'build.mjs')],
    {
      cwd: fixtureHubRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`,
      },
    },
  );

  assertCommandSucceeded(result);
  return readFileSync(path.join(fixtureHubRoot, 'dist/.env'), 'utf8');
}

function assertCommandSucceeded(result: ReturnType<typeof spawnSync>): void {
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout));
  }
}

function writeExecutable(file: string, content: string): void {
  writeFileSync(file, content);
  chmodSync(file, 0o755);
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}

function createWorkspacePackage(
  packagesRoot: string,
  directoryName: string,
  packageJson: Record<string, unknown>,
): void {
  const packageRoot = path.join(packagesRoot, directoryName);
  writeJson(path.join(packageRoot, 'package.json'), packageJson);
  mkdirSync(path.join(packageRoot, 'dist'), { recursive: true });
  writeFileSync(
    path.join(packageRoot, 'dist/index.js'),
    'export const feature = true;\n',
  );
}
