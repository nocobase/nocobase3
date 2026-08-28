import spawn from 'cross-spawn';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { writePortalDistEnv } from '@nocobase/app-server-kit/build/portal-env';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const distDir = path.join(rootDir, 'dist');
const appPackage = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'),
);
const configuredPluginNames = Object.keys(appPackage.nocobase?.plugins ?? {});
const workspacePluginNames = configuredPluginNames.filter((packageName) => {
  const packageDir = path.resolve(rootDir, '..', packageName.split('/').at(-1));
  if (!fs.existsSync(path.join(packageDir, 'package.json'))) {
    return false;
  }

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
  );
  return packageJson.name === packageName;
});
const serverEnvKeys = new Set([
  'NODE_ENV',
  'APP_BASE_PATH',
  'APP_SERVER_HOST',
  'APP_SERVER_PORT',
  'APP_SERVER_START_LOG',
  'NOCOBASE_API_PROXY_TARGET',
  'API_CLIENT_STORAGE_PREFIX',
  'API_CLIENT_STORAGE_TYPE',
  'API_CLIENT_SHARE_TOKEN',
  'DB_CONNECTION',
  'DB_DATABASE',
  'DB_DEBUG',
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_CHARSET',
  'DB_SSL',
  'DB_SCHEMA',
  'DB_MIGRATIONS_AUTO_RUN',
  'DB_MIGRATIONS_TABLE',
  'DB_MIGRATIONS_LOCK_TABLE',
  'DB_SEEDS_AUTO_RUN',
  'DB_SEEDS_TABLE',
  'DB_SEEDS_LOCK_TABLE',
  'QUEUE_CONNECTION',
  'QUEUE_REDIS_PREFIX',
  'QUEUE_DB_CONNECTION',
  'QUEUE_TABLE',
  'QUEUE_SCHEDULES_TABLE',
  'QUEUE_WORKER_CONNECTION',
  'QUEUE_WORKER_QUEUES',
  'QUEUE_WORKER_CONCURRENCY',
  'QUEUE_WORKER_IDLE_DELAY',
  'QUEUE_WORKER_TIMEOUT',
  'QUEUE_JOBS_AUTO_LOAD',
  'QUEUE_JOBS_HOT_RELOAD',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_USERNAME',
  'REDIS_PASSWORD',
  'REDIS_DB',
  'REDIS_TLS',
  'WORKFLOW_ARTIFACT_DISK',
  'WORKFLOW_SOURCE_RESOLVER_DIAGNOSTIC',
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
  '@nocobase/app-portal-sdk',
  '--filter',
  '@nocobase/app-sdk',
  '--filter',
  '@nocobase/app-database',
  '--filter',
  '@nocobase/app-server-kit',
  '--filter',
  '@nocobase/caching',
  '--filter',
  '@nocobase/drive',
  '--filter',
  '@nocobase/id-generator',
  '--filter',
  '@nocobase/logging',
  '--filter',
  '@nocobase/queue',
  '--filter',
  '@nocobase/session',
  ...workspacePluginNames.flatMap((packageName) => ['--filter', packageName]),
  'build',
]);
run('Build server', 'pnpm', ['exec', 'tsc', '-p', 'tsconfig.server.json']);
run('Rewrite server path aliases', 'pnpm', [
  'exec',
  'tsc-alias',
  '-p',
  'tsconfig.server.json',
]);
run('Build database tasks', 'pnpm', [
  'exec',
  'tsc',
  '-p',
  'tsconfig.migrations.json',
]);
run('Build workflow artifacts', 'pnpm', [
  'exec',
  'tsx',
  '--tsconfig',
  'tsconfig.node.json',
  './scripts/build-workflows.ts',
]);
run('Rewrite database task path aliases', 'pnpm', [
  'exec',
  'tsc-alias',
  '-p',
  'tsconfig.migrations.json',
]);
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
  '\nBuild complete: dist/client, dist/server, dist/scripts, dist/.env, and dist/package.json',
);
