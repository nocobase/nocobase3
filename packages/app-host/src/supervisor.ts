/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type AppHostSupervisorStatus =
  | 'disabled'
  | 'external'
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'stopping'
  | 'failed';

export type AppHostDriver = 'disabled' | 'external' | 'node' | 'tsx';

export interface AppHostSupervisorOptions {
  enabled?: boolean;
  targetUrl?: string;
  appDistDir?: string;
  host?: string;
  port?: number;
  driver?: AppHostDriver;
  prestart?: boolean;
  startTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  healthPath?: string;
  controlToken?: string;
}

export interface AppHostSupervisorInfo {
  driver: AppHostDriver;
  status: AppHostSupervisorStatus;
  targetUrl?: string;
  pid?: number;
  activeLeases: number;
  appDistDir?: string;
  entrypoint?: string;
}

export interface AppHostLease {
  targetUrl: URL;
  release(): void;
}

interface ManagedChild {
  child: ChildProcess;
  entrypoint?: string;
  port: number;
  targetUrl: URL;
}

interface AppHostLaunchOptions {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  entrypoint?: string;
}

const DEFAULT_APP_HOST_PORT = 13010;
const DEFAULT_START_TIMEOUT_MS = 30 * 1000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 30 * 1000;
const DEFAULT_HEALTH_PATH = '/__health';
const APP_HOST_CHILD_DENIED_NODE_OPTIONS = [
  '--preserve-symlinks',
  '--preserve-symlinks-main',
];
const APP_HOST_CHILD_DENIED_ENV_KEYS = new Set([
  'API_CLIENT_SHARE_TOKEN',
  'API_CLIENT_STORAGE_PREFIX',
  'API_CLIENT_STORAGE_TYPE',
  'APP_BASE_PATH',
  'APP_BROWSER_BASE_PATH',
  'APP_CLIENT_INDEX',
  'APP_NAME',
  'APP_SERVER_HOST',
  'APP_SERVER_PORT',
  'APP_SERVER_START_LOG',
  'APP_VITE_DEV_HOST',
  'APP_VITE_DEV_PORT',
  'APP_VITE_DEV_URL',
  'AUTH_SECRET',
  'NOCOBASE_API_PROXY_PATH',
  'NOCOBASE_API_PROXY_TARGET',
  'NOCOBASE_API_URL',
  'NOCOBASE_AUTH_URL',
]);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export class AppHostSupervisor {
  private static instance: AppHostSupervisor | null = null;
  private readonly enabled: boolean;
  private readonly driver: AppHostDriver;
  private readonly externalUrl?: URL;
  private readonly appDistDir?: string;
  private readonly host: string;
  private readonly configuredPort?: number;
  private readonly startTimeoutMs: number;
  private readonly shutdownTimeoutMs: number;
  private readonly healthPath: string;
  private readonly controlToken?: string;
  private status: AppHostSupervisorStatus;
  private managedChild: ManagedChild | null = null;
  private startPromise: Promise<URL> | null = null;
  private stopPromise: Promise<void> | null = null;
  private activeLeases = 0;
  private shuttingDown = false;

  private constructor(options: AppHostSupervisorOptions = {}) {
    this.enabled = options.enabled ?? process.env.APP_HOST_ENABLED !== 'false';
    this.externalUrl = normalizeUrl(
      options.targetUrl ?? process.env.APP_HOST_URL,
    );
    this.driver = this.resolveDriver(options);
    this.appDistDir = options.appDistDir ?? process.env.APP_DIST_DIR;
    this.host = options.host ?? process.env.APP_HOST_BIND ?? '127.0.0.1';
    this.configuredPort = options.port ?? numberFromEnv('APP_HOST_PORT');
    this.startTimeoutMs =
      options.startTimeoutMs ??
      numberFromEnv('APP_HOST_START_TIMEOUT_MS') ??
      DEFAULT_START_TIMEOUT_MS;
    this.shutdownTimeoutMs =
      options.shutdownTimeoutMs ??
      numberFromEnv('APP_HOST_SHUTDOWN_TIMEOUT_MS') ??
      DEFAULT_SHUTDOWN_TIMEOUT_MS;
    this.healthPath =
      options.healthPath ??
      process.env.APP_HOST_HEALTH_PATH ??
      DEFAULT_HEALTH_PATH;
    this.controlToken =
      options.controlToken ?? process.env.APP_HOST_CONTROL_TOKEN;
    this.status =
      !this.enabled || this.driver === 'disabled'
        ? 'disabled'
        : this.externalUrl
          ? 'external'
          : 'stopped';

    process.once('SIGINT', () => {
      this.shutdown().catch((error) => {
        console.error('Failed to shutdown app-host child process', error);
      });
    });
    process.once('SIGTERM', () => {
      this.shutdown().catch((error) => {
        console.error('Failed to shutdown app-host child process', error);
      });
    });

    if (options.prestart ?? process.env.APP_HOST_PRESTART === 'true') {
      this.ensureStarted().catch((error) => {
        console.error('Failed to prestart app-host child process', error);
      });
    }
  }

  static getInstance(
    options: AppHostSupervisorOptions = {},
  ): AppHostSupervisor {
    if (!AppHostSupervisor.instance) {
      AppHostSupervisor.instance = new AppHostSupervisor(options);
    }

    return AppHostSupervisor.instance;
  }

  static resetInstance(): void {
    AppHostSupervisor.instance = null;
  }

  getStatus(): AppHostSupervisorStatus {
    return this.status;
  }

  getInfo(): AppHostSupervisorInfo {
    return {
      driver: this.driver,
      status: this.status,
      targetUrl:
        this.externalUrl?.toString() ?? this.managedChild?.targetUrl.toString(),
      pid: this.managedChild?.child.pid,
      activeLeases: this.activeLeases,
      appDistDir: this.appDistDir,
      entrypoint: this.managedChild?.entrypoint,
    };
  }

  async acquire(): Promise<AppHostLease> {
    const targetUrl = await this.ensureStarted();
    this.activeLeases += 1;

    return {
      targetUrl,
      release: () => {
        this.release();
      },
    };
  }

  async ensureStarted(): Promise<URL> {
    if (!this.enabled) {
      throw new Error('App host is disabled');
    }

    if (this.externalUrl) {
      return this.externalUrl;
    }

    if (this.managedChild && this.status === 'ready') {
      return this.managedChild.targetUrl;
    }

    if (this.startPromise) {
      return await this.startPromise;
    }

    this.startPromise = this.startManagedChild();
    try {
      return await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async stop(reason = 'app-host stopped'): Promise<void> {
    if (this.externalUrl || !this.enabled || !this.managedChild) {
      return;
    }

    if (this.stopPromise) {
      return await this.stopPromise;
    }

    this.stopPromise = this.stopManagedChild(reason);
    try {
      await this.stopPromise;
    } finally {
      this.stopPromise = null;
    }
  }

  async restart(reason = 'app-host restarted'): Promise<URL> {
    if (this.externalUrl || this.driver === 'external') {
      throw new Error(
        'App host is external and cannot be restarted by the supervisor',
      );
    }
    if (!this.enabled || this.driver === 'disabled') {
      throw new Error('App host is disabled');
    }

    await this.stop(reason);
    return await this.ensureStarted();
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) {
      return;
    }

    this.shuttingDown = true;
    await this.stop('App host supervisor shutdown');
  }

  private async startManagedChild(): Promise<URL> {
    if (this.stopPromise) {
      await this.stopPromise;
    }

    this.status = 'starting';
    const port = await this.resolvePort();
    const targetUrl = new URL(`http://${this.host}:${port}`);
    const launchOptions = this.resolveLaunchOptions(port);

    const child = spawn(launchOptions.command, launchOptions.args, {
      cwd: process.cwd(),
      env: launchOptions.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.managedChild = {
      child,
      entrypoint: launchOptions.entrypoint,
      port,
      targetUrl,
    };

    this.pipeChildLogs(child);
    child.once('exit', (code, signal) => {
      const wasStopping = this.status === 'stopping' || this.shuttingDown;
      this.managedChild = null;
      this.status = wasStopping ? 'stopped' : 'failed';
      if (!wasStopping) {
        console.error(
          `app-host exited unexpectedly; code=${code ?? 'null'} signal=${signal ?? 'null'}`,
        );
      }
    });

    try {
      await this.waitForReady(targetUrl);
      this.status = 'ready';
      return targetUrl;
    } catch (error) {
      this.status = 'failed';
      await this.stopManagedChild('app-host failed to start');
      throw error;
    }
  }

  private async stopManagedChild(reason: string): Promise<void> {
    const managed = this.managedChild;
    if (!managed) {
      this.status = this.enabled ? 'stopped' : 'disabled';
      return;
    }

    this.status = 'stopping';
    console.log(`Stopping app-host child process: ${reason}`);
    const exitPromise = waitForChildExit(managed.child, this.shutdownTimeoutMs);
    managed.child.kill('SIGTERM');

    await exitPromise.catch((error) => {
      console.warn(error instanceof Error ? error.message : String(error));
      managed.child.kill('SIGKILL');
    });

    this.managedChild = null;
    this.status = this.enabled ? 'stopped' : 'disabled';
  }

  private release(): void {
    this.activeLeases = Math.max(0, this.activeLeases - 1);
  }

  private resolveDriver(options: AppHostSupervisorOptions): AppHostDriver {
    if (!(options.enabled ?? process.env.APP_HOST_ENABLED !== 'false')) {
      return 'disabled';
    }
    if (options.targetUrl ?? process.env.APP_HOST_URL) {
      return 'external';
    }

    const driver = options.driver ?? process.env.APP_HOST_DRIVER ?? 'node';
    return driver === 'tsx' ? 'tsx' : 'node';
  }

  private resolveLaunchOptions(port: number): AppHostLaunchOptions {
    if (this.driver === 'tsx') {
      return this.resolveTsxLaunchOptions(port);
    }

    return this.resolveNodeLaunchOptions(port);
  }

  private baseAppHostEnv(port: number): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...sanitizeAppHostChildEnvironment(process.env),
      PORT: `${port}`,
      APP_HOST_PORT: `${port}`,
      APP_HOST_BIND: this.host,
      APP_DIST_DIR: this.appDistDir,
    };
    if (this.controlToken) {
      env.APP_HOST_CONTROL_TOKEN = this.controlToken;
    }
    const nodeOptions = sanitizeAppHostChildNodeOptions(env.NODE_OPTIONS);

    if (nodeOptions) {
      env.NODE_OPTIONS = nodeOptions;
    } else {
      delete env.NODE_OPTIONS;
    }

    return env;
  }

  private resolveNodeLaunchOptions(port: number): AppHostLaunchOptions {
    const entrypoint = resolveNodeAppHostEntrypoint();
    if (!entrypoint) {
      this.status = 'failed';
      throw new Error(
        'The app-host code is not compiled. Please run pnpm build first.',
      );
    }

    return {
      command: process.execPath,
      // Workspace exports resolve server-kit to TypeScript sources. Load the
      // source hook only in that development layout; published packages point
      // to compiled JavaScript and run with plain Node.js.
      args: requiresWorkspaceTypeScriptLoader()
        ? ['--import', 'tsx', entrypoint]
        : [entrypoint],
      env: this.baseAppHostEnv(port),
      entrypoint,
    };
  }

  private resolveTsxLaunchOptions(port: number): AppHostLaunchOptions {
    const entrypoint = resolveTsxAppHostEntrypoint();
    const tsxCli = resolveTsxCli();
    if (!entrypoint) {
      this.status = 'failed';
      throw new Error('The app-host source entrypoint does not exist.');
    }
    if (!tsxCli) {
      this.status = 'failed';
      throw new Error(
        'The tsx runtime is not installed. Please run pnpm install first.',
      );
    }

    const tsconfig =
      process.env.APP_HOST_TSCONFIG ?? process.env.SERVER_TSCONFIG_PATH;
    const args = [tsxCli, 'watch', '--clear-screen=false'];
    if (tsconfig) {
      args.push('--tsconfig', tsconfig);
    }
    args.push(entrypoint);

    return {
      command: process.execPath,
      args,
      env: {
        ...this.baseAppHostEnv(port),
        NODE_ENV: 'development',
      },
      entrypoint,
    };
  }

  private async resolvePort(): Promise<number> {
    if (this.configuredPort) {
      return this.configuredPort;
    }

    const appPort = numberFromEnv('APP_PORT') ?? DEFAULT_APP_HOST_PORT - 10;
    return await findAvailablePort(appPort + 10, this.host);
  }

  private pipeChildLogs(child: ChildProcess): void {
    child.stdout?.on('data', (chunk: string | Buffer) => {
      writePrefixedChunk(
        'app-host',
        typeof chunk === 'string' ? Buffer.from(chunk) : chunk,
        process.stdout,
      );
    });
    child.stderr?.on('data', (chunk: string | Buffer) => {
      writePrefixedChunk(
        'app-host',
        typeof chunk === 'string' ? Buffer.from(chunk) : chunk,
        process.stderr,
      );
    });
  }

  private async waitForReady(targetUrl: URL): Promise<void> {
    const startedAt = Date.now();
    let lastError: Error | null = null;

    while (Date.now() - startedAt < this.startTimeoutMs) {
      if (!this.managedChild) {
        throw new Error('app-host child process exited before it became ready');
      }

      try {
        await requestHealth(
          new URL(this.healthPath, targetUrl),
          this.controlToken,
        );
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        await sleep(250);
      }
    }

    throw new Error(
      `app-host did not become ready within ${this.startTimeoutMs}ms: ${lastError?.message ?? ''}`,
    );
  }
}

function resolveNodeAppHostEntrypoint(): string | null {
  const explicit = process.env.APP_HOST_ENTRY;
  if (explicit && existsSync(path.resolve(process.cwd(), explicit))) {
    return path.resolve(process.cwd(), explicit);
  }

  const compiled = path.resolve(currentDir, 'cli.js');
  if (existsSync(compiled)) {
    return compiled;
  }

  return null;
}

function requiresWorkspaceTypeScriptLoader(): boolean {
  return existsSync(
    path.resolve(currentDir, '../../app-server-kit/src/support/index.ts'),
  );
}

function resolveTsxAppHostEntrypoint(): string | null {
  const explicit = process.env.APP_HOST_ENTRY;
  if (explicit && existsSync(path.resolve(process.cwd(), explicit))) {
    return path.resolve(process.cwd(), explicit);
  }

  const candidates = [
    // The supervisor itself may be executed from TypeScript source.
    path.resolve(currentDir, 'cli.ts'),
    // Package exports resolve to dist/supervisor.js during workspace dev, but
    // the tsx driver must still execute the source CLI.
    path.resolve(currentDir, '../src/cli.ts'),
  ];
  for (const source of candidates) {
    if (existsSync(source)) {
      return source;
    }
  }

  return null;
}

function resolveTsxCli(): string | null {
  const explicit = process.env.APP_HOST_TSX_CLI;
  if (explicit && existsSync(path.resolve(process.cwd(), explicit))) {
    return path.resolve(process.cwd(), explicit);
  }

  try {
    return require.resolve('tsx/cli', { paths: [process.cwd()] });
  } catch {
    const local = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');
    return existsSync(local) ? local : null;
  }
}

function normalizeUrl(value?: string): URL | undefined {
  if (!value) {
    return undefined;
  }

  return new URL(value);
}

export function sanitizeAppHostChildNodeOptions(value: unknown): string {
  return (typeof value === 'string' ? value : '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter(
      (option) =>
        !APP_HOST_CHILD_DENIED_NODE_OPTIONS.some(
          (deniedOption) =>
            option === deniedOption || option.startsWith(`${deniedOption}=`),
        ),
    )
    .join(' ');
}

export function sanitizeAppHostChildEnvironment(
  source: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([key]) =>
        !key.startsWith('HUB_') && !APP_HOST_CHILD_DENIED_ENV_KEYS.has(key),
    ),
  );
}

function numberFromEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

async function findAvailablePort(
  startPort: number,
  host: string,
): Promise<number> {
  for (let port = startPort; port <= 65_535; port += 1) {
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }

  throw new Error(
    `Unable to find an available App Host port from ${startPort} to 65535 on ${host}.`,
  );
}

function isPortAvailable(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

function requestHealth(url: URL, controlToken?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      url,
      {
        headers: controlToken
          ? {
              authorization: `Bearer ${controlToken}`,
            }
          : undefined,
      },
      (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
          return;
        }

        reject(
          new Error(
            `health check returned ${res.statusCode ?? 'unknown status'}`,
          ),
        );
      },
    );

    req.setTimeout(1000, () => {
      req.destroy(new Error('health check timed out'));
    });
    req.once('error', reject);
  });
}

function waitForChildExit(
  child: ChildProcess,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`app-host did not exit within ${timeoutMs}ms`));
    }, timeoutMs);

    const onExit = () => {
      cleanup();
      resolve();
    };

    const cleanup = () => {
      clearTimeout(timer);
      child.off('exit', onExit);
    };

    child.once('exit', onExit);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function writePrefixedChunk(
  prefix: string,
  chunk: Buffer,
  writer: NodeJS.WriteStream,
): void {
  const text = chunk.toString();
  const lines = text.split(/\r?\n/);
  const hasTrailingNewline = text.endsWith('\n') || text.endsWith('\r');

  lines.forEach((line, index) => {
    if (!line && index === lines.length - 1 && hasTrailingNewline) {
      return;
    }

    writer.write(`[${prefix}] ${line}\n`);
  });
}
