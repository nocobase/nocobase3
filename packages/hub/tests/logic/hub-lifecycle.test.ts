// @vitest-environment node

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { createServer as createEmbeddedServer } from '../../server/embedded.ts';
import type { AppDisposer } from '../../server/embedded.ts';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const temporaryDirectories: string[] = [];
const children: ChildProcess[] = [];
const occupiedServers: Server[] = [];

interface OutputCollector {
  readonly done: Promise<string>;
  waitFor(text: string): Promise<void>;
}

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL');
  }
  await Promise.all(
    occupiedServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('standalone Hub lifecycle', () => {
  it('starts one local App Host and shares its Registry with the Hub control plane', async () => {
    const { hubPort, appHostPort } = await reserveStandalonePorts();
    const appDistDir = path.resolve(
      packageRoot,
      '../app-host/fixtures/app-dist',
    );
    const child = await startStandalone(hubPort, appHostPort, {
      releaseRoot: appDistDir,
      useGenericHostEnvironment: true,
    });

    const hostResponse = await fetch(`http://127.0.0.1:${appHostPort}/__apps`);
    expect(hostResponse.status).toBe(200);
    const hostPayload = (await hostResponse.json()) as {
      definitions: Array<{ id: string }>;
    };
    expect(hostPayload.definitions).toEqual([]);

    const hubResponse = await fetch(
      `http://127.0.0.1:${hubPort}/hub/api/healthz`,
    );
    expect(hubResponse.status).toBe(200);
    await expect(hubResponse.json()).resolves.toMatchObject({
      data: { host: 'available' },
    });

    child.kill('SIGTERM');
    const [code, signal] = (await once(child, 'exit')) as [
      number | null,
      NodeJS.Signals | null,
    ];
    expect({ code, signal }).toEqual({ code: 0, signal: null });
    await expectPortReleased(appHostPort);
  });

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'closes the HTTP server and Hub runtime on %s',
    async (signal) => {
      const { hubPort, appHostPort } = await reserveStandalonePorts();
      const child = await startStandalone(hubPort, appHostPort);

      child.kill(signal);
      const [code, receivedSignal] = (await once(child, 'exit')) as [
        number | null,
        NodeJS.Signals | null,
      ];

      expect({ code, signal: receivedSignal }).toEqual({
        code: 0,
        signal: null,
      });
      await expectPortReleased(hubPort);
      await expectPortReleased(appHostPort);
    },
  );

  it('cancels startup when shutdown arrives while App Host discovery is in progress', async () => {
    const { hubPort, appHostPort } = await reserveStandalonePorts();
    const root = createStandaloneRoot();
    const marker = path.join(root, 'app-host-starting');
    const child = spawnStandalone(hubPort, appHostPort, {
      root,
      startupMarker: marker,
    });
    const stderr = collectOutput(child, 'stderr');

    await waitForPath(marker);
    child.kill('SIGTERM');

    const [code, signal] = (await Promise.race([
      once(child, 'exit'),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Standalone did not stop during startup')),
          5_000,
        ),
      ),
    ])) as [number | null, NodeJS.Signals | null];
    const errorOutput = await stderr.done;
    if (code !== 0 || signal !== null) {
      throw new Error(
        `Standalone did not stop cleanly: code=${code}, signal=${signal}\n${errorOutput}`,
      );
    }
    await expectPortReleased(hubPort);
    await expectPortReleased(appHostPort);
  });

  it('handles Hub listen failures and releases Hub and Host resources', async () => {
    const occupied = createHttpServer();
    occupiedServers.push(occupied);
    const hubPort = await listen(occupied);
    const appHostPort = await reservePort();
    const child = spawnStandalone(hubPort, appHostPort);
    const stderr = collectOutput(child, 'stderr');

    const [code, signal] = (await once(child, 'exit')) as [
      number | null,
      NodeJS.Signals | null,
    ];
    const errorOutput = await stderr.done;

    expect({ code, signal }).toEqual({ code: 1, signal: null });
    expect(errorOutput).toContain('EADDRINUSE');
    expect(errorOutput).not.toContain("Unhandled 'error' event");
    await expectPortReleased(appHostPort);
  });

  it('handles App Host listen failures without starting the Hub server', async () => {
    const occupied = createHttpServer();
    occupiedServers.push(occupied);
    const appHostPort = await listen(occupied);
    const hubPort = await reservePort();
    const child = spawnStandalone(hubPort, appHostPort);
    const stderr = collectOutput(child, 'stderr');

    const [code, signal] = (await once(child, 'exit')) as [
      number | null,
      NodeJS.Signals | null,
    ];
    const errorOutput = await stderr.done;

    expect({ code, signal }).toEqual({ code: 1, signal: null });
    expect(errorOutput).toContain('EADDRINUSE');
    expect(errorOutput).not.toContain("Unhandled 'error' event");
    await expectPortReleased(hubPort);
  });
});

describe('embedded Hub lifecycle', () => {
  it('cleans up and fails clearly when registerDisposer is missing', async () => {
    const root = createEmbeddedRoot();
    const databasePath = path.join(root, 'hub.sqlite');

    await expect(
      createEmbeddedServer({
        id: 'hub',
        basePath: '/hub',
        rootDir: root,
        config: {
          hubEnabled: true,
          authSecret: 'embedded-missing-disposer-secret-32-chars',
          hubDatabasePath: databasePath,
        },
      }),
    ).rejects.toThrow('Hub embedded AppScope must provide registerDisposer()');

    let disposer: AppDisposer | undefined;
    const app = await createEmbeddedServer({
      id: 'hub',
      basePath: '/hub',
      rootDir: root,
      config: {
        hubEnabled: true,
        authSecret: 'embedded-missing-disposer-secret-32-chars',
        hubDatabasePath: databasePath,
      },
      registerDisposer: (_name, dispose) => {
        disposer = dispose;
      },
    });
    expect(
      (await app.request('http://localhost/api/setup/status')).status,
    ).toBe(200);
    await disposer?.();
  });

  it('registers an idempotent disposer and serves auth on the stripped /api path', async () => {
    const root = createEmbeddedRoot();
    let disposerName: string | undefined;
    let disposer: AppDisposer | undefined;
    const app = await createEmbeddedServer({
      id: 'hub',
      basePath: '/hub',
      rootDir: root,
      config: {
        hubEnabled: true,
        authSecret: 'embedded-auth-lifecycle-secret-32-chars',
        hubDatabasePath: path.join(root, 'hub.sqlite'),
      },
      registerDisposer: (name, dispose) => {
        disposerName = name;
        disposer = dispose;
      },
    });

    expect(disposerName).toBe('hub');
    const owner = await app.request('http://localhost/api/setup/owner', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({
        email: 'embedded-owner@example.com',
        password: 'correct horse battery staple',
        name: 'Embedded Owner',
        username: 'embeddedowner',
      }),
    });
    expect(owner.status).toBe(201);

    const signIn = await app.request(
      'http://localhost/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost',
        },
        body: JSON.stringify({
          email: 'embedded-owner@example.com',
          password: 'correct horse battery staple',
        }),
      },
    );
    expect(signIn.status).toBe(200);

    const firstClose = disposer?.();
    const secondClose = disposer?.();
    await expect(Promise.all([firstClose, secondClose])).resolves.toBeDefined();
  });
});

function createEmbeddedRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nocobase-hub-embedded-life-'));
  temporaryDirectories.push(root);
  mkdirSync(path.join(root, 'dist'), { recursive: true });
  return root;
}

interface StandaloneSpawnOptions {
  releaseRoot?: string;
  useGenericHostEnvironment?: boolean;
  root?: string;
  startupMarker?: string;
}

async function startStandalone(
  hubPort: number,
  appHostPort: number,
  options: StandaloneSpawnOptions = {},
): Promise<ChildProcess> {
  const child = spawnStandalone(hubPort, appHostPort, options);
  const stdout = collectOutput(child, 'stdout');
  await Promise.race([
    stdout.waitFor('App server listening'),
    once(child, 'exit').then(([code, signal]) => {
      throw new Error(
        `Standalone exited before listening: code=${code}, signal=${signal}`,
      );
    }),
  ]);
  return child;
}

function spawnStandalone(
  hubPort: number,
  appHostPort: number,
  options: StandaloneSpawnOptions = {},
): ChildProcess {
  const root = options.root ?? createStandaloneRoot();
  const useGenericHostEnvironment = options.useGenericHostEnvironment ?? false;
  const imports = options.startupMarker
    ? [
        '--import',
        path.join(packageRoot, 'tests/fixtures/delay-app-host-startup.mjs'),
      ]
    : [];
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      ...imports,
      path.join(packageRoot, 'server/standalone.ts'),
    ],
    {
      cwd: packageRoot,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        APP_NAME: 'hub',
        APP_BASE_PATH: '/hub',
        APP_SERVER_HOST: '127.0.0.1',
        APP_SERVER_PORT: String(hubPort),
        APP_SERVER_START_LOG: 'true',
        APP_HOST_PORT: useGenericHostEnvironment ? '' : String(appHostPort),
        PORT: useGenericHostEnvironment ? String(appHostPort) : '',
        APP_HOST_BIND: useGenericHostEnvironment ? '' : '127.0.0.1',
        HOST: useGenericHostEnvironment ? '127.0.0.1' : '',
        APP_DIST_DIR: useGenericHostEnvironment ? '' : root,
        HUB_ENABLED: 'true',
        AUTH_SECRET: 'standalone-lifecycle-secret-at-least-32-chars',
        HUB_DATABASE_PATH: path.join(root, 'hub.sqlite'),
        HUB_RELEASE_ROOT: options.releaseRoot ?? root,
        HUB_LIFECYCLE_STARTUP_MARKER: options.startupMarker ?? '',
        NOCOBASE_API_URL: '/hub/v2/api',
        NOCOBASE_API_PROXY_TARGET: '',
        NOCOBASE_API_PROXY_PATH: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  children.push(child);
  return child;
}

function createStandaloneRoot(): string {
  const root = mkdtempSync(
    path.join(tmpdir(), 'nocobase-hub-standalone-life-'),
  );
  temporaryDirectories.push(root);
  return root;
}

async function waitForPath(filePath: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (existsSync(filePath)) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

function collectOutput(
  child: ChildProcess,
  stream: 'stdout' | 'stderr',
): OutputCollector {
  const output = child[stream];
  if (!output) {
    return {
      done: Promise.resolve(''),
      waitFor: (text: string) =>
        Promise.reject(new Error(`Output did not contain ${text}`)),
    };
  }
  let value = '';
  const waiters = new Map<string, Array<() => void>>();
  output.setEncoding('utf8');
  output.on('data', (chunk: string) => {
    value += chunk;
    for (const [text, callbacks] of waiters) {
      if (!value.includes(text)) continue;
      waiters.delete(text);
      for (const callback of callbacks) callback();
    }
  });
  const done = new Promise<string>((resolve) => {
    output.on('end', () => resolve(value));
  });
  return {
    done,
    waitFor: (text: string): Promise<void> => {
      if (value.includes(text)) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const callbacks = waiters.get(text) ?? [];
        callbacks.push(resolve);
        waiters.set(text, callbacks);
      });
    },
  };
}

async function reservePort(): Promise<number> {
  const server = createHttpServer();
  const port = await listen(server);
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function reserveStandalonePorts(): Promise<{
  hubPort: number;
  appHostPort: number;
}> {
  const hubPort = await reservePort();
  let appHostPort = await reservePort();
  while (appHostPort === hubPort) appHostPort = await reservePort();
  return { hubPort, appHostPort };
}

async function expectPortReleased(port: number): Promise<void> {
  const server = createHttpServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to resolve server port.'));
        return;
      }
      resolve(address.port);
    });
  });
}
