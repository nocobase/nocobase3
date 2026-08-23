import spawn from 'cross-spawn';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const viteDevPreferredPort = 5173;

const parseEnv = (content) => {
  const parsed = {};
  const linePattern =
    /^\s*(?:export\s+)?([\w.-]+)\s*=\s*('(?:\\'|[^'])*'|"(?:\\"|[^"])*"|[^#\r\n]*)?\s*(?:#.*)?$/;

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(linePattern);
    if (!match) continue;

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
    if (match.startsWith('\\')) return match.slice(1);
    return env[key] ?? '';
  });

const loadEnv = () => {
  const env = {};

  for (const envFile of ['.env', '.env.local']) {
    const envPath = path.join(rootDir, envFile);
    if (!fs.existsSync(envPath)) continue;
    Object.assign(env, parseEnv(fs.readFileSync(envPath, 'utf8')));
  }

  const expansionEnv = { ...env, ...process.env };
  for (const [key, value] of Object.entries(env)) {
    env[key] = expandEnvValue(value, expansionEnv);
  }

  return { ...env, ...process.env };
};

const canListen = (host, port) =>
  new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.listen(port, host, () => {
      server.close(() => {
        resolve(true);
      });
    });
  });

const findAvailablePort = async (host, preferredPort) => {
  for (let port = preferredPort; port < preferredPort + 100; port += 1) {
    if (await canListen(host, port)) {
      return port;
    }
  }

  throw new Error(
    `Unable to find an available Vite dev port from ${preferredPort} to ${preferredPort + 99}.`,
  );
};

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
    stdio: options.filterViteStartup ? ['inherit', 'pipe', 'pipe'] : 'inherit',
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

const shutdown = (exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;

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
const vitePort = await findAvailablePort(viteDevHost, viteDevPreferredPort);
const appBasePath = String(
  env.APP_BASE_PATH || `/${env.APP_NAME || 'app-template-default'}`,
)
  .trim()
  .replace(/^\/+|\/+$/g, '');
const proxyApiPath =
  env.NOCOBASE_API_URL ||
  `/${[appBasePath, 'v2/api'].filter(Boolean).join('/')}`;
const nextEnv = {
  ...env,
  APP_SERVER_HOST: env.APP_SERVER_HOST || '0.0.0.0',
  APP_VITE_DEV_HOST: viteDevHost,
  APP_VITE_DEV_PORT: String(vitePort),
  APP_VITE_DEV_URL: `http://${toUrlHost(viteDevHost)}:${vitePort}`,
  NOCOBASE_API_URL: proxyApiPath,
};
const appServerHost = nextEnv.APP_SERVER_HOST || '127.0.0.1';
const appServerPort = numberFromEnv(nextEnv.APP_SERVER_PORT, 13000);
const appServerUrl = `http://${toUrlHost(appServerHost)}:${appServerPort}`;
const appUrl = appBasePath
  ? `${appServerUrl}/${appBasePath}/`
  : `${appServerUrl}/`;
const workflowBuild = spawn.sync(
  'tsx',
  ['--tsconfig', 'tsconfig.node.json', 'scripts/build-workflows.ts'],
  { cwd: rootDir, env: nextEnv, stdio: 'inherit' },
);
if (workflowBuild.error) throw workflowBuild.error;
if (workflowBuild.status !== 0) process.exit(workflowBuild.status ?? 1);

console.log(`\n  App dev server ready`);
console.log(`  Local:     ${appUrl}`);
console.log(`  Proxy API: ${appServerUrl}${proxyApiPath}\n`);

spawnDevProcess(
  'client',
  'vite',
  ['--host', viteDevHost, '--port', String(vitePort), '--strictPort'],
  nextEnv,
  { filterViteStartup: true },
);

spawnDevProcess(
  'server',
  'tsx',
  [
    'watch',
    '--tsconfig',
    'tsconfig.server.json',
    '--clear-screen=false',
    '--include',
    'package.json',
    '--include',
    '../app-plugin-*/package.json',
    '--include',
    '../app-plugin-*/database/**/*',
    '--include',
    '../app-plugin-*/server/**/*',
    'server/standalone.ts',
  ],
  {
    ...nextEnv,
    APP_SERVER_START_LOG: 'false',
  },
);
