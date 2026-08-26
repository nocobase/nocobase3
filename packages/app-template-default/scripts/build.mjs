import spawn from 'cross-spawn';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const distDir = path.join(rootDir, 'dist');
const sourceEnvPath = path.join(rootDir, '.env');
const artifactEnvPath = path.join(distDir, '.env');
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
const run = (label, command, args) => {
  console.log(`\n> ${label}`);

  const result = spawn.sync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

fs.rmSync(distDir, { recursive: true, force: true });

run('Typecheck client', 'pnpm', ['exec', 'tsc']);
run('Typecheck tooling', 'pnpm', ['exec', 'tsc', '-p', 'tsconfig.node.json']);
run('Build client', 'pnpm', ['exec', 'refine', 'build']);
run('Build server workspace dependencies', 'pnpm', [
  '--filter',
  '@nocobase/app-sdk',
  '--filter',
  '@nocobase/app-database',
  '--filter',
  '@nocobase/app-server-kit',
  '--filter',
  '@nocobase/caching',
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
run('Rewrite database task path aliases', 'pnpm', [
  'exec',
  'tsc-alias',
  '-p',
  'tsconfig.migrations.json',
]);
if (fs.existsSync(sourceEnvPath)) {
  fs.copyFileSync(sourceEnvPath, artifactEnvPath);
  fs.chmodSync(artifactEnvPath, 0o600);
}
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
  '\nBuild complete: dist/client, dist/server, dist/scripts, optional artifact .env, and dist/package.json',
);
