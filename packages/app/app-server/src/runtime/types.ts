import type { EnvMap } from '../config/index.js';
import type { AppConfigAccessor } from '../config/index.js';
import type { ApplicationFetchHandler } from '../application/index.js';
import type { AppWebSocketHandler } from '@nocobase/app-websocket';

export type AppDisposer = () => void | Promise<void>;

export interface AppLifecycle {
  registerDisposer(name: string, dispose: AppDisposer): void;
}

export interface AppServer {
  readonly fetch: ApplicationFetchHandler;
  websocket?: AppWebSocketHandler;
}

export interface AppInstance extends AppServer {
  readonly config: AppConfigAccessor;
}

export interface AppPathOptions {
  readonly rootDir: string;
  readonly serverDir: string;
  readonly databaseDir?: string;
  readonly clientDir?: string;
  readonly storageDir?: string;
}

/**
 * The host-owned runtime boundary passed to an application factory.
 *
 * Hosts may expose additional state, but applications should depend only on
 * this shared contract. Optional members let embedded and standalone hosts
 * provide the information available in their respective runtime modes.
 */
export interface AppScope extends AppLifecycle {
  readonly mode?: 'embedded' | 'standalone';
  readonly id: string;
  readonly appName?: string;
  readonly version?: number;
  readonly basePath: string;
  readonly assetsBasePath?: string;
  readonly clientDir?: string;
  /**
   * Deprecated. App servers should define app-local API routes under `/api`.
   */
  readonly apiBasePath?: string;
  readonly rootDir?: string;
  readonly dataDir?: string;
  /** Optional configuration file path supplied by the host. */
  readonly configPath?: string;
  /** Explicit configuration environment. Embedded Apps default to an empty map. */
  readonly env?: EnvMap;
  /** Fully resolved application paths supplied by the host when available. */
  readonly paths?: AppPathOptions;
  readonly signal?: AbortSignal;
  onBeforeDestroy?(handler: AppDisposer): () => void;
}
