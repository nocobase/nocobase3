import path from 'node:path';

import { readEnvFiles, type EnvMap } from '@nocobase/app-server-kit/config';
import {
  normalizeBasePath,
  resolveAppNameFromBasePath,
} from '@nocobase/app-server-kit/support';

import type { AppDisposer } from '../app-options.js';
import { onceAsync } from './disposers.js';
import type { AppPathOptions, AppScope } from './options.js';

export interface StandaloneScopeOptions {
  readonly paths?: AppPathOptions;
  readonly appName?: string;
  readonly basePath?: string;
  readonly config?: unknown;
  readonly env?: EnvMap;
  readonly viteDevUrl?: string | false;
}

export class StandaloneScope implements AppScope {
  public readonly mode = 'standalone' as const;
  public readonly id: string;
  public readonly appName: string;
  public readonly basePath: string;
  public readonly rootDir: string;
  public readonly dataDir: string;
  public readonly clientDir: string;
  public readonly config: unknown;
  public readonly env: EnvMap;
  public readonly paths: AppPathOptions;
  public readonly signal: AbortSignal;

  private readonly abortController: AbortController = new AbortController();
  private readonly beforeDestroyHandlers: AppDisposer[] = [];
  private readonly disposers: Array<{
    readonly name: string;
    readonly dispose: () => Promise<void>;
  }> = [];
  private readonly destroyOnce: () => Promise<void>;

  public constructor(options: StandaloneScopeOptions = {}) {
    this.paths = options.paths ?? resolveStandalonePaths();
    this.env = loadStandaloneEnv(this.paths, options);
    this.rootDir = this.paths.rootDir;
    this.dataDir = this.paths.storageDir ?? path.join(this.rootDir, 'storage');
    this.clientDir = this.paths.clientDir ?? path.join(this.rootDir, 'client');
    this.config = options.config;
    this.basePath = normalizeBasePath(
      options.basePath ?? this.env.APP_BASE_PATH ?? '/main',
    );
    this.appName =
      options.appName ?? resolveAppNameFromBasePath(this.basePath, 'main');
    this.id = this.appName;
    this.signal = this.abortController.signal;
    this.destroyOnce = onceAsync(() => this.destroyResources());
  }

  public registerDisposer(name: string, dispose: AppDisposer): void {
    this.disposers.push({ name, dispose: onceAsync(dispose) });
  }

  public onBeforeDestroy(handler: AppDisposer): () => void {
    this.beforeDestroyHandlers.push(handler);
    return (): void => {
      const index = this.beforeDestroyHandlers.indexOf(handler);
      if (index >= 0) this.beforeDestroyHandlers.splice(index, 1);
    };
  }

  public destroy(): Promise<void> {
    return this.destroyOnce();
  }

  private async destroyResources(): Promise<void> {
    this.abortController.abort(new Error('standalone app closed'));
    const errors: unknown[] = [];

    for (const handler of [...this.beforeDestroyHandlers]) {
      try {
        await handler();
      } catch (error) {
        errors.push(error);
      }
    }
    this.beforeDestroyHandlers.length = 0;

    for (const entry of [...this.disposers].reverse()) {
      try {
        await entry.dispose();
      } catch (error) {
        errors.push(
          new Error(`Failed to dispose standalone resource "${entry.name}".`, {
            cause: error,
          }),
        );
      }
    }
    this.disposers.length = 0;

    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, 'Failed to destroy standalone scope.');
    }
  }
}

export function createStandaloneScope(
  options: StandaloneScopeOptions = {},
): StandaloneScope {
  return new StandaloneScope(options);
}

function resolveStandalonePaths(): AppPathOptions {
  const serverDir = path.resolve(import.meta.dirname, '..');
  const rootDir = path.resolve(serverDir, '..');
  const built = path.basename(rootDir) === 'dist';

  return {
    rootDir,
    serverDir,
    databaseDir: path.join(rootDir, 'database'),
    clientDir: path.join(rootDir, built ? 'client' : 'dist/client'),
    storageDir: path.join(rootDir, 'storage'),
  };
}

function loadStandaloneEnv(
  paths: AppPathOptions,
  options: StandaloneScopeOptions,
): EnvMap {
  const env = {
    ...readEnvFiles(
      [
        path.join(paths.rootDir, '.env'),
        path.join(paths.rootDir, '.env.local'),
      ],
      process.env,
    ),
    ...process.env,
    ...options.env,
  };

  if (options.viteDevUrl !== undefined) {
    env.APP_VITE_DEV_URL =
      options.viteDevUrl === false ? 'false' : options.viteDevUrl;
  }

  return env;
}
