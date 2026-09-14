// @vitest-environment node

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import http, { type IncomingMessage } from 'node:http';
import net, { type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

import {
  createServer as createViteServer,
  type ServerOptions,
  type ViteDevServer,
} from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDevProxy, parseProxyTarget } from '../../scripts/dev/proxy.mjs';

interface ReceivedRequest {
  body: string;
  host: string | undefined;
  method: string;
  url: string;
}

interface TestBackend {
  httpRequests: ReceivedRequest[];
  server: http.Server;
  upgradedSockets: Socket[];
  upgrades: ReceivedRequest[];
  url: string;
}

type DevProxy = ServerOptions['proxy'];

const backends: TestBackend[] = [];
const viteServers: ViteDevServer[] = [];
const devEntrySource = readFileSync(
  new URL('../../scripts/dev/index.mjs', import.meta.url),
  'utf8',
);

afterEach(async () => {
  await Promise.all(viteServers.splice(0).map((server) => server.close()));
  await Promise.all(
    backends.splice(0).map(async ({ server, upgradedSockets }) => {
      upgradedSockets.forEach((socket) => socket.destroy());
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }),
  );
});

describe('remote development proxy', () => {
  it('accepts absolute HTTP app base URLs and rejects unsafe targets', () => {
    expect(parseProxyTarget(undefined)).toBeUndefined();
    expect(parseProxyTarget('   ')).toBeUndefined();
    expect(parseProxyTarget(' https://remote.example.com/nocobase/ ')).toEqual(
      new URL('https://remote.example.com/nocobase/'),
    );

    for (const target of [
      '/remote',
      'ftp://remote.example.com/app',
      'https://user:secret@remote.example.com/app',
      'https://remote.example.com/app?tenant=test',
      'https://remote.example.com/app#settings',
    ]) {
      expect(() => parseProxyTarget(target)).toThrow();
    }
  });

  it('does not configure a proxy without a target', () => {
    expect(createDevProxy('/main', undefined)).toBeUndefined();
    expect(createDevProxy('/main/', '   ')).toBeUndefined();
  });

  it('isolates simultaneous proxies on operating-system-assigned ports', async () => {
    const backend = await startBackend();
    const urls = await Promise.all([
      startVite(createDevProxy('/main', backend.url)),
      startVite(createDevProxy('/main', backend.url)),
    ]);

    expect(new Set(urls).size).toBe(2);
    for (const url of urls) {
      const response = await fetch(`${url}/main/api/healthz`);
      expect(await response.json()).toMatchObject({ url: '/api/healthz' });
    }
  });

  it('forwards API traffic to a different remote app base', async () => {
    const backend = await startBackend();
    const devUrl = await startVite(
      createDevProxy('/main/', `${backend.url}/remote/`),
    );

    const response = await fetch(`${devUrl}/main/api/articles?include=author`, {
      body: JSON.stringify({ title: 'Remote development' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const request = (await response.json()) as ReceivedRequest;

    expect(request).toMatchObject({
      body: JSON.stringify({ title: 'Remote development' }),
      host: new URL(backend.url).host,
      method: 'POST',
      url: '/remote/api/articles?include=author',
    });
    expect(response.headers.get('set-cookie')).toContain('Path=/main/');
    expect(response.headers.get('set-cookie')).not.toMatch(/domain=/i);

    const apiRootResponse = await fetch(`${devUrl}/main/api?schema=1`);
    const apiRootRequest = (await apiRootResponse.json()) as ReceivedRequest;
    expect(apiRootRequest.url).toBe('/remote/api?schema=1');

    const forwardedCount = backend.httpRequests.length;
    expect((await fetch(`${devUrl}/main/apiary`)).status).toBe(404);
    expect((await fetch(`${devUrl}/main/ws-console`)).status).toBe(404);
    expect(backend.httpRequests).toHaveLength(forwardedCount);
  });

  it('supports a remote app mounted at the origin root', async () => {
    const backend = await startBackend();
    const devUrl = await startVite(createDevProxy('/', `${backend.url}/`));

    const response = await fetch(`${devUrl}/api/health?verbose=true`);
    const request = (await response.json()) as ReceivedRequest;

    expect(request.url).toBe('/api/health?verbose=true');
    expect(response.headers.get('set-cookie')).toContain('Path=/');
  });

  it('forwards WebSocket upgrades to the remote app base', async () => {
    const backend = await startBackend();
    const devUrl = await startVite(
      createDevProxy('/main', `${backend.url}/remote`),
    );

    const response = await requestUpgrade(
      `${devUrl}/main/ws?channel=notifications`,
    );

    expect(response).toMatch(/^HTTP\/1\.1 101 /);
    expect(backend.upgrades).toEqual([
      expect.objectContaining({
        host: new URL(backend.url).host,
        url: '/remote/ws?channel=notifications',
      }),
    ]);
  });
});

describe('remote development runner', () => {
  it('keeps preflight hooks but omits the local backend lifecycle', async () => {
    const run = await runDevMode('http://remote.example.com/remote');

    expect(
      run.findAvailablePort.mock.calls.map(([options]) => options.label),
    ).toEqual(['Vite dev']);
    expect(
      run.spawnDevProcess.mock.calls.map(([label, command]) => [
        label,
        command,
      ]),
    ).toEqual([['client', 'vite']]);
    expect(run.resolvePluginWatchIncludes).not.toHaveBeenCalled();
    expect(run.resolveConfigWatch).not.toHaveBeenCalled();
    expect(run.watch).not.toHaveBeenCalled();
    expect(
      run.waitForHttpReady.mock.calls.map(([options]) => options.label),
    ).toEqual(['Vite dev server']);
    expect(run.sync).toHaveBeenCalledTimes(1);
  });

  it('starts, watches, and probes the local backend by default', async () => {
    const run = await runDevMode(undefined);

    expect(
      run.findAvailablePort.mock.calls.map(([options]) => options.label),
    ).toEqual(['Vite dev', 'application server']);
    expect(
      run.spawnDevProcess.mock.calls.map(([label, command]) => [
        label,
        command,
      ]),
    ).toEqual([
      ['client', 'vite'],
      ['server', 'tsx'],
    ]);
    expect(run.resolvePluginWatchIncludes).toHaveBeenCalledTimes(1);
    expect(run.resolveConfigWatch).toHaveBeenCalledTimes(1);
    expect(run.watch).toHaveBeenCalledTimes(1);
    expect(
      run.waitForHttpReady.mock.calls.map(([options]) => options.label),
    ).toEqual(['Vite dev server', 'Application server']);
    expect(run.sync).toHaveBeenCalledTimes(1);
  });
});

async function startBackend(): Promise<TestBackend> {
  const httpRequests: ReceivedRequest[] = [];
  const upgrades: ReceivedRequest[] = [];
  const upgradedSockets: Socket[] = [];
  const server = http.createServer(async (request, response) => {
    const received = await readRequest(request);
    httpRequests.push(received);
    response.setHeader(
      'set-cookie',
      'nocobase-session=test; Domain=remote.example.com; Path=/remote/',
    );
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(received));
  });
  const backend: TestBackend = {
    httpRequests,
    server,
    upgradedSockets,
    upgrades,
    url: '',
  };
  backends.push(backend);

  server.on('upgrade', (request, socket) => {
    upgradedSockets.push(socket);
    upgrades.push({
      body: '',
      host: request.headers.host,
      method: request.method ?? '',
      url: request.url ?? '',
    });

    const key = request.headers['sec-websocket-key'];
    if (typeof key !== 'string') {
      socket.destroy(new Error('Missing WebSocket key.'));
      return;
    }
    const accept = createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
  });

  backend.url = await listen(server);
  return backend;
}

async function startVite(proxy: DevProxy): Promise<string> {
  const server = await createViteServer({
    appType: 'custom',
    cacheDir: path.join(tmpdir(), `nocobase-dev-proxy-test-${randomUUID()}`),
    configFile: false,
    logLevel: 'silent',
    optimizeDeps: { include: [], noDiscovery: true },
    server: {
      host: '127.0.0.1',
      proxy,
    },
  });
  viteServers.push(server);
  if (!server.httpServer) {
    throw new Error('Expected a standalone Vite HTTP server.');
  }
  // Vite 6's listen() replaces port 0 with 5173. Bind the underlying HTTP
  // server directly so the OS allocates an independent port for each test.
  return listen(server.httpServer);
}

async function listen(server: http.Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to resolve the backend test port.'));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function readRequest(request: IncomingMessage): Promise<ReceivedRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return {
    body: Buffer.concat(chunks).toString('utf8'),
    host: request.headers.host,
    method: request.method ?? '',
    url: request.url ?? '',
  };
}

async function requestUpgrade(url: string): Promise<string> {
  const target = new URL(url);

  return new Promise((resolve, reject) => {
    const socket = net.connect(Number(target.port), target.hostname, () => {
      socket.write(
        `GET ${target.pathname}${target.search} HTTP/1.1\r\n` +
          `Host: ${target.host}\r\n` +
          'Connection: Upgrade\r\n' +
          'Upgrade: websocket\r\n' +
          'Sec-WebSocket-Version: 13\r\n' +
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n',
      );
    });
    let response = '';
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timed out waiting for an upgrade from ${url}.`));
    }, 2_000);

    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      response += chunk;
      if (!response.includes('\r\n\r\n')) {
        return;
      }
      clearTimeout(timeout);
      socket.destroy();
      resolve(response);
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

interface DevHook {
  command: string[];
  label: string;
}

async function runDevMode(proxyTarget: string | undefined) {
  const runtimeSource = devEntrySource.slice(
    devEntrySource.indexOf('const env = loadEnv();'),
  );
  const findAvailablePort = vi.fn(async ({ label }: { label: string }) =>
    label === 'Vite dev' ? 5173 : 13000,
  );
  const resolvePluginWatchIncludes = vi.fn(() => ['plugins/**']);
  const resolveConfigWatch = vi.fn(() => ({
    directory: '/app',
    filenames: new Set(['config.yml']),
  }));
  const serverStdin = { write: vi.fn() };
  const spawnDevProcess = vi.fn((label: string, _command: string) => ({
    stdin: label === 'server' ? serverStdin : undefined,
  }));
  const sync = vi.fn(
    (_command: string, _args: string[], _options: unknown) => ({ status: 0 }),
  );
  const waitForHttpReady = vi.fn(
    async (options: { label: string; url: string }) => options,
  );
  const watch = vi.fn(() => ({ close: vi.fn() }));
  const hook: DevHook = {
    command: ['pnpm', 'nocobase', 'demo', 'build'],
    label: 'Build plugin artifacts',
  };
  const execution = runInNewContext(`(async () => {${runtimeSource}})()`, {
    console: { error: vi.fn(), log: vi.fn() },
    findAvailablePort,
    fs: { watch },
    loadEnv: () => ({
      APP_BASE_PATH: '/main',
      PROXY_TARGET_URL: proxyTarget,
    }),
    numberFromEnv: (value: string | undefined, fallback: number) =>
      value ? Number(value) : fallback,
    parseProxyTarget: (value: string | undefined) =>
      value ? new URL(value) : undefined,
    process: {
      exit: vi.fn(),
      stdin: { pipe: vi.fn() },
    },
    readCliHooks: () => ({ dev: { beforeDev: [hook] } }),
    resolveConfigWatch,
    resolvePluginWatchIncludes,
    rootDir: '/app',
    runHookStage: (
      hooks: { beforeDev: DevHook[] },
      stage: 'beforeDev',
      run: (label: string, command: string, args: string[]) => void,
    ) => {
      for (const entry of hooks[stage]) {
        run(entry.label, entry.command[0], entry.command.slice(1));
      }
    },
    shuttingDown: false,
    spawn: { sync },
    spawnDevProcess,
    toUrlHost: (host: string) => host,
    viteDevPreferredPort: 5173,
    waitForHttpReady,
  }) as Promise<void>;
  await execution;

  return {
    findAvailablePort,
    resolveConfigWatch,
    resolvePluginWatchIncludes,
    spawnDevProcess,
    sync,
    waitForHttpReady,
    watch,
  };
}
