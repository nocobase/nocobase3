import spawn from 'cross-spawn';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStandaloneAppEnv } from '@nocobase/app-server/node';

import { resolvePluginWatchIncludes } from './dev-plugin-watches.mjs';
import { resolveConfigWatch } from './dev-config-watch.mjs';
import { findAvailablePort } from './dev-ports.mjs';
import { waitForHttpReady } from './dev-readiness.mjs';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const viteDevPreferredPort = 5173;

const loadEnv = () => loadStandaloneAppEnv({ rootDir });

const toUrlHost = (host) => {
  if (host === '0.0.0.0') return '127.0.0.1';
  if (host === '::') return '[::1]';
  if (host.includes(':') && !host.startsWith('[')) return `[${host}]`;
  return host;
};

const numberFromEnv = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const pipeViteOutput = (child) => {
  let suppressStartupBanner = true;
  let buffer = '';

  child.stdout?.on('data', (chunk) => {
    if (!suppressStartupBanner) {
      process.stdout.write(chunk);
      return;
    }

    buffer += chunk.toString();

    const helpIndex = buffer.indexOf('press h + enter to show help');
    if (helpIndex >= 0) {
      suppressStartupBanner = false;
      const nextLineIndex = buffer.indexOf('\n', helpIndex);
      const rest = nextLineIndex >= 0 ? buffer.slice(nextLineIndex + 1) : '';
      if (rest) {
        process.stdout.write(rest);
      }
      buffer = '';
      return;
    }

    if (buffer.length > 16_000) {
      suppressStartupBanner = false;
      process.stdout.write(buffer);
      buffer = '';
    }
  });

  child.stderr?.pipe(process.stderr);
};

const spawnDevProcess = (label, command, args, env, options = {}) => {
  const child = spawn(command, args, {
    cwd: rootDir,
    env,
    stdio:
      options.stdio ??
      (options.filterViteStartup ? ['inherit', 'pipe', 'pipe'] : 'inherit'),
  });

  if (options.filterViteStartup) {
    pipeViteOutput(child);
  }

  child.once('error', (error) => {
    console.error(`[${label}] failed to start`, error);
    shutdown(1);
  });

  child.once('exit', (code, signal) => {
    if (shuttingDown) return;

    console.error(
      `[${label}] exited unexpectedly; code=${code ?? 'null'} signal=${signal ?? 'null'}`,
    );
    shutdown(typeof code === 'number' ? code : 1);
  });

  children.push(child);
  return child;
};

let shuttingDown = false;
const children = [];
let envRestartTimer;
let envWatcher;

const shutdown = (exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;

  if (envRestartTimer) {
    clearTimeout(envRestartTimer);
    envRestartTimer = undefined;
  }
  envWatcher?.close();

  for (const child of children) {
    if (!child.killed && child.exitCode === null) {
      child.kill('SIGTERM');
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed && child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }
    process.exit(exitCode);
  }, 1500).unref();
};

process.once('SIGINT', () => shutdown(0));
process.once('SIGTERM', () => shutdown(0));

const env = loadEnv();
const viteDevHost = env.APP_VITE_DEV_HOST || '0.0.0.0';
const vitePort = await findAvailablePort({
  host: viteDevHost,
  label: 'Vite dev',
  preferredPort: viteDevPreferredPort,
});
const initialEnv = {
  ...env,
  APP_SERVER_HOST: env.APP_SERVER_HOST || '0.0.0.0',
  APP_VITE_DEV_HOST: viteDevHost,
  APP_VITE_DEV_PORT: String(vitePort),
  APP_VITE_DEV_URL: `http://${toUrlHost(viteDevHost)}:${vitePort}`,
  NOCOBASE_API_URL:
    env.NOCOBASE_API_URL ||
    `/${[String(env.APP_BASE_PATH || '/main').replace(/^\/+|\/+$/g, ''), 'api']
      .filter(Boolean)
      .join('/')}`,
};
const appServerHost = initialEnv.APP_SERVER_HOST || '127.0.0.1';
const configuredAppServerPort = numberFromEnv(
  initialEnv.APP_SERVER_PORT,
  13000,
);
const appServerPort = await findAvailablePort({
  excludedPorts: [vitePort],
  host: appServerHost,
  label: 'application server',
  preferredPort: configuredAppServerPort,
});
const nextEnv = {
  ...initialEnv,
  APP_SERVER_HOST: appServerHost,
  APP_SERVER_PORT: String(appServerPort),
};
const appServerUrl = `http://${toUrlHost(appServerHost)}:${appServerPort}`;
const appBasePath = String(nextEnv.APP_BASE_PATH || '/main')
  .trim()
  .replace(/^\/+|\/+$/g, '');
const appUrl = appBasePath
  ? `${appServerUrl}/${appBasePath}/`
  : `${appServerUrl}/`;
const healthUrl = `${appServerUrl}/${[appBasePath, 'api/healthz']
  .filter(Boolean)
  .join('/')}`;
const viteUrl = `${nextEnv.APP_VITE_DEV_URL}/${appBasePath ? `${appBasePath}/` : ''}`;
const workflowBuild = spawn.sync(
  'tsx',
  [
    '--conditions=source',
    '--tsconfig',
    'tsconfig.node.json',
    'scripts/build-workflows.ts',
  ],
  { cwd: rootDir, env: nextEnv, stdio: 'inherit' },
);
if (workflowBuild.error) throw workflowBuild.error;
if (workflowBuild.status !== 0) process.exit(workflowBuild.status ?? 1);
const pluginWatchIncludes = resolvePluginWatchIncludes(rootDir);

console.log(`\n  Starting app dev server...`);

spawnDevProcess(
  'client',
  'vite',
  ['--host', viteDevHost, '--port', String(vitePort), '--strictPort'],
  nextEnv,
  { filterViteStartup: true },
);

const serverEnv = {
  ...nextEnv,
  APP_VITE_DEV_HOST: viteDevHost,
  APP_VITE_DEV_PORT: String(vitePort),
  APP_VITE_DEV_URL: `http://${toUrlHost(viteDevHost)}:${vitePort}`,
  APP_SERVER_HOST: appServerHost,
  APP_SERVER_PORT: String(appServerPort),
  APP_SERVER_START_LOG: 'false',
  APP_PUBLIC_ORIGIN:
    String(nextEnv.APP_PUBLIC_ORIGIN || '').trim() || appServerUrl,
};

const serverChild = spawnDevProcess(
  'server',
  'tsx',
  [
    'watch',
    '--tsconfig',
    'tsconfig.server.json',
    '--clear-screen=false',
    '--include',
    'package.json',
    ...pluginWatchIncludes.flatMap((include) => ['--include', include]),
    'server/standalone.ts',
  ],
  serverEnv,
  { stdio: ['pipe', 'inherit', 'inherit'] },
);

if (serverChild.stdin) {
  process.stdin.pipe(serverChild.stdin);
}

const configuredConfigPath = serverEnv.APP_CONFIG_FILE;
const configWatch = resolveConfigWatch(rootDir, configuredConfigPath);

envWatcher = fs.watch(configWatch.directory, (_eventType, filename) => {
  const changedFile = filename?.toString();
  if (!changedFile || !configWatch.filenames.has(changedFile)) return;

  if (envRestartTimer) clearTimeout(envRestartTimer);
  envRestartTimer = setTimeout(() => {
    envRestartTimer = undefined;
    console.log(`[dev] ${changedFile} changed; restarting server`);
    serverChild.stdin?.write('\n');
  }, 100);
});

try {
  await Promise.all([
    waitForHttpReady({
      label: 'Vite dev server',
      url: viteUrl,
    }),
    waitForHttpReady({
      isReady: (response, body) => {
        if (!response.ok) return false;

        try {
          return JSON.parse(body).ok === true;
        } catch {
          return false;
        }
      },
      label: 'Application server',
      url: healthUrl,
    }),
  ]);
} catch (error) {
  console.error(`[dev] ${error instanceof Error ? error.message : error}`);
  shutdown(1);
}

if (!shuttingDown) {
  console.log(`\n  App dev server ready`);
  console.log(`  Local:     ${appUrl}`);
  if (appServerPort !== configuredAppServerPort) {
    console.log(
      `  App server port ${configuredAppServerPort} is unavailable; using ${appServerPort}.`,
    );
  }
  console.log();
}
