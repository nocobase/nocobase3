import spawn from 'cross-spawn';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findWorkspacePackageDirectory } from './workspace-packages.mjs';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const distDir = path.join(rootDir, 'dist');
const envOutputPath = path.join(distDir, '.env');
const appPackage = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'),
);
const configuredPluginNames = Object.keys(appPackage.nocobase?.plugins ?? {});
const workspacePluginNames = configuredPluginNames.filter(
  (packageName) =>
    findWorkspacePackageDirectory(rootDir, packageName) !== undefined,
);
const serverEnvKeys = new Set([
  'NODE_ENV',
  'APP_BASE_PATH',
  'APP_SERVER_HOST',
  'APP_SERVER_PORT',
  'APP_SERVER_START_LOG',
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
  'NOTIFICATION_PROVIDER_TEST_ENABLED',
  'TEST_EMAIL_RECIPIENT',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'SMTP_FROM',
  'SMTP_REPLY_TO',
  'RESEND_API_KEY',
  'RESEND_FROM',
  'RESEND_REPLY_TO',
  'FEISHU_WEBHOOK_URL',
  'FEISHU_WEBHOOK_SECRET',
  'DINGTALK_WEBHOOK_URL',
  'DINGTALK_WEBHOOK_SECRET',
  'WORKFLOW_ARTIFACT_DISK',
]);

const parseEnv = (content) => {
  const parsed = {};
  const linePattern =
    /^\s*(?:export\s+)?([\w.-]+)\s*=\s*('(?:\\'|[^'])*'|"(?:\\"|[^"])*"|[^#\r\n]*)?\s*(?:#.*)?$/;

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(linePattern);
    if (!match) {
      continue;
    }

    const [, key, rawValue = ''] = match;
    const quote = rawValue[0];
    let value = rawValue.trim();

    if (
      (quote === '"' || quote === "'") &&
      value.endsWith(quote) &&
      value.length >= 2
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
  }

  return parsed;
};

const expandEnvValue = (value, env) =>
  value.replace(/\\?\${?([A-Za-z_][A-Za-z0-9_]*)}?/g, (match, key) => {
    if (match.startsWith('\\')) {
      return match.slice(1);
    }

    return env[key] ?? '';
  });

const readEnvFiles = (files, baseEnv = {}) => {
  const env = {};

  for (const envFile of files) {
    if (!fs.existsSync(envFile)) {
      continue;
    }

    Object.assign(env, parseEnv(fs.readFileSync(envFile, 'utf8')));
  }

  const expansionEnv = { ...baseEnv, ...env };
  for (const [key, value] of Object.entries(env)) {
    env[key] = expandEnvValue(value, expansionEnv);
    expansionEnv[key] = env[key];
  }

  return env;
};

const formatEnvValue = (value) => {
  if (/^[A-Za-z0-9_./:@%+-]*$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
};

const writeDistEnv = () => {
  const envFiles = [
    path.join(rootDir, '.env'),
    path.join(rootDir, '.env.local'),
  ];
  const env = readEnvFiles(envFiles, process.env);
  const entries = Object.entries(env).filter(([key]) => serverEnvKeys.has(key));

  if (entries.length === 0) {
    console.log('\n> Extract environment');
    console.log(
      'No supported server environment entries found; skipped dist/.env',
    );
    return;
  }

  fs.mkdirSync(distDir, { recursive: true });
  const content = entries
    .map(([key, value]) => `${key}=${formatEnvValue(value)}`)
    .join('\n');

  fs.writeFileSync(envOutputPath, `${content}\n`, { mode: 0o600 });

  console.log('\n> Extract environment');
  console.log(
    `Generated ${path.relative(rootDir, envOutputPath)} from ${envFiles
      .filter((envFile) => fs.existsSync(envFile))
      .map((envFile) => path.basename(envFile))
      .join(', ')}`,
  );
};

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
// Both templates build this same set of plugins, and `pnpm -r build` runs the two templates concurrently. Each
// plugin's build clears its `dist` before tsc refills it, so one template can observe the other's empty `dist` and
// fail with a misleading "Missing .../dist". The recursive build already orders plugins before templates — every one
// of them is a declared dependency — so this step is only needed when a template is built on its own.
if (process.env.NOCOBASE_SKIP_WORKSPACE_DEPENDENCY_BUILD !== '1') {
  run('Build server workspace dependencies', 'pnpm', [
    '--filter',
    '@nocobase/db',
    '--filter',
    '@nocobase/i18n',
    '--filter',
    '@nocobase/app-server',
    '--filter',
    '@nocobase/caching',
    '--filter',
    '@nocobase/drive',
    '--filter',
    '@nocobase/snowflake',
    '--filter',
    '@nocobase/logging',
    '--filter',
    '@nocobase/queue',
    '--filter',
    '@nocobase/service-provider',
    '--filter',
    '@nocobase/session',
    ...workspacePluginNames.flatMap((packageName) => ['--filter', packageName]),
    'build',
  ]);
}
run('Build server', 'pnpm', ['exec', 'tsc', '-p', 'tsconfig.server.json']);
run('Rewrite server path aliases', 'pnpm', [
  'exec',
  'tsc-alias',
  '-p',
  'tsconfig.server.json',
]);
run('Build workflow artifacts', 'pnpm', [
  'exec',
  'workflow',
  'build',
  '--resource-root',
  './dist/server/workflows',
]);
writeDistEnv();
run('Generate server package', 'node', [
  './scripts/build-server-dist-package.mjs',
]);
run('Install server production dependencies', 'npm', [
  'install',
  '--omit=dev',
  '--legacy-peer-deps',
  '--package-lock=false',
  '--prefix',
  './dist',
]);
run('Clean server dependency bins', 'node', ['./scripts/clean-dist-bin.mjs']);

console.log(
  '\nBuild complete: dist/client, dist/server, dist/scripts, dist/.env, and dist/package.json',
);
