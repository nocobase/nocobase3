import spawn from 'cross-spawn';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { writePortalDistEnv } from '../../../packages/app-server/scripts/write-portal-dist-env.mjs';

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
  'AUTH_SECRET',
  'APP_HOST_PUBLIC_URL',
  'NOCOBASE_AUTH_URL',
  'CRM_DATABASE_PATH',
  'CRM_DATA_DIR',
  'CRM_ALLOW_ADDITIONAL_SIGN_UP',
  'API_CLIENT_STORAGE_PREFIX',
  'API_CLIENT_STORAGE_TYPE',
  'API_CLIENT_SHARE_TOKEN',
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
  '@nocobase/app-sdk',
  '--filter',
  '@nocobase/database',
  '--filter',
  '@nocobase/app-server',
  '--filter',
  '@nocobase/caching',
  '--filter',
  '@nocobase/app-plugin-authentication',
  'build',
]);
run('Build server', 'pnpm', ['exec', 'tsc', '-p', 'tsconfig.server.json']);
run('Build migrations', 'pnpm', [
  'exec',
  'tsc',
  '-p',
  'tsconfig.migrations.json',
]);
fs.mkdirSync(path.join(distDir, 'server', 'seed'), { recursive: true });
fs.copyFileSync(
  path.join(rootDir, 'nocobase', 'seed', 'demo-data.json'),
  path.join(distDir, 'server', 'seed', 'demo-data.json'),
);
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
