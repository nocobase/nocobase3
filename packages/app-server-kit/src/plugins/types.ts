import type {
  ServiceContainer,
  ServiceProviderLifecycle,
} from '@nocobase/service-provider';
import type { Hono } from 'hono';
import type {
  AppConfigAccessor,
  AppConfigDefinition,
} from '../config/index.js';

import type { ConfigPaths } from '../config/index.js';
import type { AppApiRoutes, AppRootRoutes } from '../router/index.js';

export interface AppPluginApplication {
  readonly appName: string;
  readonly publicBasePath: string;
  readonly config: AppConfigAccessor;
  readonly paths: ConfigPaths;
  readonly router: Hono;
  readonly apiRouter: Hono;
  readonly container: ServiceContainer;
}

export type AppPluginProviderConstructor = new (
  app: AppPluginApplication,
) => ServiceProviderLifecycle;

export interface AppServerPluginDatabaseContribution {
  readonly migrations?: string;
  readonly seeds?: string;
}

export interface AppServerPluginQueueContribution {
  readonly jobs?: readonly string[];
}

export interface AppServerPluginDefinition {
  readonly packageName: string;
  readonly config?:
    | AppConfigDefinition<unknown, never>
    | readonly AppConfigDefinition<unknown, never>[];
  readonly providers?: readonly AppPluginProviderConstructor[];
  readonly apiRoutes?: readonly AppApiRoutes<AppPluginApplication>[];
  readonly rootRoutes?: readonly AppRootRoutes<AppPluginApplication>[];
  readonly database?: AppServerPluginDatabaseContribution;
  readonly queue?: AppServerPluginQueueContribution;
}

export interface AppServerPlugin {
  readonly packageName: string;
  readonly config: readonly AppConfigDefinition<unknown, never>[];
  readonly providers: readonly AppPluginProviderConstructor[];
  readonly apiRoutes: readonly AppApiRoutes<AppPluginApplication>[];
  readonly rootRoutes: readonly AppRootRoutes<AppPluginApplication>[];
  readonly database?: AppServerPluginDatabaseContribution;
  readonly queue?: AppServerPluginQueueContribution;
}

export interface AppServerPlugins {
  readonly plugins: readonly AppServerPlugin[];
}

export interface ResolvedAppPlugin {
  readonly packageName: string;
  readonly version: string;
  readonly rootDir: string;
  readonly migrationsDirectory?: string;
  readonly seedsDirectory?: string;
  readonly jobLocations: readonly string[];
}

export interface ResolvedAppServerPlugin {
  readonly definition: AppServerPlugin;
  readonly metadata: ResolvedAppPlugin;
}

export interface ResolvedAppServerPlugins {
  readonly appPackageName: string;
  readonly plugins: readonly ResolvedAppServerPlugin[];
}
