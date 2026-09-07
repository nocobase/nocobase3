import spawn from 'cross-spawn';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const distDir = path.join(rootDir, 'dist');
// Read rather than written as a literal: this script ships into generated applications, whose name is their own.
const appPackageName = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'),
).name;
const envOutputPath = path.join(distDir, '.env');
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

const run = (label, command, args, options = {}) => {
  console.log(`\n> ${label}`);

  const result = spawn.sync(command, args, {
    cwd: options.cwd ?? rootDir,
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
// `^...` selects every workspace package this one depends on, transitively, which is exactly the set whose `dist`
// the steps below read. Spelling the set out by hand drifted instead: `@nocobase/config` was missing from the list
// and a template built on its own failed at "Generate server package" with `Missing ../../libs/config/dist`.
//
// Only needed when a template is built alone. `pnpm -r build` already orders dependencies first, and it runs the two
// templates concurrently — where each plugin's build clears its `dist` before tsc refills it, so one template can
// observe the other's empty `dist` and fail with a misleading "Missing .../dist".
//
// In a generated application there is no workspace to select from, so pnpm matches nothing and exits successfully.
if (process.env.NOCOBASE_SKIP_WORKSPACE_DEPENDENCY_BUILD !== '1') {
  run('Build server workspace dependencies', 'pnpm', [
    '--filter',
    `${appPackageName}^...`,
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
// Installed with pnpm, matching the rest of this project, and run with `dist` as the working directory rather than
// through `--dir`. pnpm resolves `allowBuilds` from the directory it runs in, and `build-server-dist-package.mjs`
// wrote a `pnpm-workspace.yaml` there carrying it. `--dir` leaves the process in the application root, where pnpm
// reads the root's settings instead, finds the drivers undecided, and rewrites every entry in the generated file to
// "set this to true or false" before stopping.
//
// `allowBuilds` is what lets the native driver compile. Without it the install still reports success and the failure
// surfaces only on the deployed server, as a missing bindings file that names nothing pointing back here.
//
// `--no-lockfile` because `dist/package.json` is generated fresh on every build, and the tree is installed once at
// deploy time from a manifest whose versions are already resolved. `--ignore-workspace` would defeat the point: it
// makes pnpm skip the generated file as well. Nothing is needed to keep the install local — a directory holding a
// `pnpm-workspace.yaml` is a pnpm root in its own right.
run(
  'Install server production dependencies',
  'pnpm',
  ['install', '--prod', '--no-lockfile'],
  { cwd: distDir },
);
run('Materialize server dependency links', 'node', [
  './scripts/clean-dist-bin.mjs',
]);

console.log(
  '\nBuild complete: dist/client, dist/server, dist/scripts, dist/.env, and dist/package.json',
);
