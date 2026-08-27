import spawn from 'cross-spawn';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { writePortalDistEnv } from '@nocobase/app-server-kit/build/portal-env';
import { serverEnvKeys } from './server-env-keys.mjs';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const distDir = path.join(rootDir, 'dist');
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
  '@nocobase/app-host',
  '--filter',
  '@nocobase/app-database',
  '--filter',
  '@nocobase/app-plugin-authentication',
  '--filter',
  '@nocobase/hub-release-management',
  '--filter',
  '@nocobase/app-server-kit',
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
