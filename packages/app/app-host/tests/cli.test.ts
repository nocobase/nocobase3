import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

// The published `app-host` binary: what a service manager or Docker `CMD` starts.
const cliPath = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
// Inside this repository the workspace packages the CLI imports resolve to TypeScript sources, so the binary is
// started through tsx here exactly as the package's own `start` script does. A published install needs nothing.
const tsxLoader = createRequire(import.meta.url).resolve('tsx');
const directories: string[] = [];
const children: ChildProcess[] = [];

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await once(child, 'close');
    }
  }
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createRootDir(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'app-host-cli-'));
  directories.push(directory);
  return directory;
}

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('Could not allocate a loopback port');
  }
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

function startCli(
  rootDir: string,
  environment: Record<string, string>,
): ChildProcess & { output: () => string } {
  const child = spawn(process.execPath, ['--import', tsxLoader, cliPath], {
    cwd: rootDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      APP_HOST_BIND: '127.0.0.1',
      ...environment,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let output = '';
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => {
    output += chunk;
  });
  child.stderr?.on('data', (chunk: string) => {
    output += chunk;
  });
  return Object.assign(child, { output: () => output });
}

async function waitForHealth(
  child: ChildProcess & { output: () => string },
  port: number,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `app-host exited with ${child.exitCode} before it became healthy:\n${child.output()}`,
      );
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/__health`);
      if (response.ok) {
        return (await response.json()) as Record<string, unknown>;
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`app-host did not become healthy:\n${child.output()}`);
}

describe('app-host command line', () => {
  it('starts a standalone host from the environment and shuts down cleanly on SIGTERM', async () => {
    const rootDir = await createRootDir();
    const port = await freePort();
    const child = startCli(rootDir, {
      APP_HOST_MODE: 'standalone',
      APP_HOST_PORT: String(port),
    });

    const health = await waitForHealth(child, port);
    expect(health).toMatchObject({ mode: 'standalone' });

    const apps = await fetch(`http://127.0.0.1:${port}/__apps`);
    expect(apps.status).toBe(200);
    // An empty revisions directory under the working directory hosts nothing until something is deployed.
    expect(await apps.json()).toEqual({ active: [], definitions: [] });
    expect(child.output()).toContain('App host started');

    child.kill('SIGTERM');
    const [code] = (await once(child, 'close')) as [number | null];
    expect(code).toBe(0);
    expect(child.output()).toContain('Shutting down app host');
    await expect(fetch(`http://127.0.0.1:${port}/__health`)).rejects.toThrow();
  });

  it('refuses to start a managed host without the Hub session it must attach to', async () => {
    const rootDir = await createRootDir();
    const port = await freePort();
    const child = startCli(rootDir, {
      APP_HOST_MODE: 'managed',
      APP_HOST_PORT: String(port),
    });

    const [code] = (await once(child, 'close')) as [number | null];
    expect(code).toBe(1);
    expect(child.output()).toContain(
      'Managed app host requires APP_HOST_SESSION',
    );
  });
});
