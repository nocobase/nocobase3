import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  buildServerDistPackage,
  finalizeServerDistPackage,
} from '../../../packages/app-server-kit/scripts/build-server-dist-package.mjs';
import { writePortalDistEnv } from '../../../packages/app-server-kit/scripts/write-portal-dist-env.mjs';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const distDir = path.join(rootDir, 'dist');
const typescriptCli = path.join(rootDir, 'node_modules/.bin/tsc');
const viteCli = path.join(rootDir, 'node_modules/.bin/vite');
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
  'SERVICE_DESK_DATABASE_PATH',
  'API_CLIENT_STORAGE_PREFIX',
  'API_CLIENT_STORAGE_TYPE',
  'API_CLIENT_SHARE_TOKEN',
]);
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: rootDir, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

fs.rmSync(distDir, { recursive: true, force: true });
run(typescriptCli, ['--noEmit']);
run(typescriptCli, ['-p', 'tsconfig.node.json', '--noEmit']);
run(viteCli, ['build']);
run('pnpm', [
  '--filter',
  '@nocobase/app-sdk',
  '--filter',
  '@nocobase/app-database',
  '--filter',
  '@nocobase/app-server-kit',
  '--filter',
  '@nocobase/authorization',
  '--filter',
  '@nocobase/app-plugin-authentication',
  '--filter',
  '@nocobase/app-plugin-access-control',
  'build',
]);
run(typescriptCli, ['-p', 'tsconfig.server.json']);
run(typescriptCli, ['-p', 'tsconfig.migrations.json']);
writePortalDistEnv({ rootDir, allowedKeys: serverEnvKeys });
buildServerDistPackage({ rootDir });
run('npm', [
  'install',
  '--omit=dev',
  '--package-lock=false',
  '--prefix',
  './dist',
]);
finalizeServerDistPackage({ rootDir });
console.log('Built self-contained dist/client and dist/server.');
