import spawn from 'cross-spawn';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { writePortalDistEnv } from '../../app-server/scripts/write-portal-dist-env.mjs';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const distDir = path.join(rootDir, 'dist');
const serverEnvKeys = new Set([
  'APP_NAME',
  'APP_BASE_PATH',
  'APP_BROWSER_BASE_PATH',
  'APP_SERVER_HOST',
  'APP_SERVER_PORT',
  'APP_SERVER_START_LOG',
  'NOCOBASE_API_URL',
  'NOCOBASE_API_PROXY_PATH',
  'NOCOBASE_API_PROXY_TARGET',
  'API_CLIENT_STORAGE_PREFIX',
  'API_CLIENT_STORAGE_TYPE',
  'API_CLIENT_SHARE_TOKEN',
  'APP_HOST_CONTROL_URL',
  'APP_HOST_GATEWAY_URL',
  'APP_HOST_PORT',
  'HUB_RELEASE_STORE_PATH',
  'HUB_RELEASE_MANAGER_ROLES',
  'HUB_RELEASE_AUDIT_ROLE',
  'HUB_RELEASE_AUDIT_COLLECTION',
  'HUB_SETTINGS_STORE_PATH',
  'HUB_SETTINGS_MANAGER_ROLES',
  'HUB_DATABASE_PATH',
  'HUB_ADMIN_EMAILS',
  'NOCOBASE_AUTH_URL',
]);

const run = (label, command, args) => {
  console.log(`\n> ${label}`);

  const result = spawn.sync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

fs.rmSync(distDir, { recursive: true, force: true });

run('Typecheck client', 'pnpm', ['exec', 'tsc']);
run('Typecheck tooling', 'pnpm', ['exec', 'tsc', '-p', 'tsconfig.node.json']);
run('Build client', 'pnpm', ['exec', 'refine', 'build']);
run('Build server workspace dependencies', 'pnpm', [
  '--filter',
  '@nocobase/database',
  '--filter',
  '@nocobase/app-plugin-authentication',
  '--filter',
  '@nocobase/hub-release-management',
  '--filter',
  '@nocobase/app-server',
  'build',
]);
run('Build server', 'pnpm', ['exec', 'tsc', '-p', 'tsconfig.server.json']);
writePortalDistEnv({ rootDir, allowedKeys: serverEnvKeys });
run('Generate server package', 'node', [
  './scripts/build-server-dist-package.mjs',
]);
run('Install server production dependencies', 'npm', [
  'install',
  '--omit=dev',
  '--package-lock=false',
  '--prefix',
  './dist',
]);
run('Clean server dependency bins', 'node', ['./scripts/clean-dist-bin.mjs']);

console.log(
  '\nBuild complete: dist/client, dist/server, dist/.env, and dist/package.json',
);
