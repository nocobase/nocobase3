import type {
  ServiceContainer,
  ServiceProviderLifecycle,
} from '@nocobase/service-provider';
import type { Hono } from 'hono';

import type { ApplicationConfig } from '../application/index.js';
import type { ConfigPaths } from '../config/index.js';
import type { AppRouteContribution } from '../router/index.js';

export interface AppPluginApplication<
  TConfig extends ApplicationConfig = ApplicationConfig,
> {
  readonly appName: string;
  readonly publicBasePath: string;
  readonly config: TConfig;
  readonly paths: ConfigPaths;
  readonly router: Hono;
  readonly container: ServiceContainer;
}

export type AppPluginProviderConstructor<
  TConfig extends ApplicationConfig = ApplicationConfig,
> = new (app: AppPluginApplication<TConfig>) => ServiceProviderLifecycle;

export interface AppServerPluginDatabaseContribution {
  readonly migrations?: string;
  readonly seeds?: string;
}

export interface AppServerPluginQueueContribution {
  readonly jobs?: readonly string[];
}

export interface AppServerPluginDefinition<
  TConfig extends ApplicationConfig = ApplicationConfig,
> {
  readonly packageName: string;
  readonly providers?: readonly AppPluginProviderConstructor<TConfig>[];
  readonly routes?: readonly AppRouteContribution<
    AppPluginApplication<TConfig>
  >[];
  readonly database?: AppServerPluginDatabaseContribution;
  readonly queue?: AppServerPluginQueueContribution;
}

export interface AppServerPlugin<
  TConfig extends ApplicationConfig = ApplicationConfig,
> {
  readonly packageName: string;
  readonly providers: readonly AppPluginProviderConstructor<TConfig>[];
  readonly routes: readonly AppRouteContribution<
    AppPluginApplication<TConfig>
  >[];
  readonly database?: AppServerPluginDatabaseContribution;
  readonly queue?: AppServerPluginQueueContribution;
}

export interface AppServerPlugins<
  TConfig extends ApplicationConfig = ApplicationConfig,
> {
  readonly plugins: readonly AppServerPlugin<TConfig>[];
}

export interface ResolvedAppPlugin {
  readonly packageName: string;
  readonly version: string;
  readonly rootDir: string;
  readonly migrationsDirectory?: string;
  readonly seedsDirectory?: string;
  readonly jobLocations: readonly string[];
}

export interface ResolvedAppServerPlugin<
  TConfig extends ApplicationConfig = ApplicationConfig,
> {
  readonly definition: AppServerPlugin<TConfig>;
  readonly metadata: ResolvedAppPlugin;
}

export interface ResolvedAppServerPlugins<
  TConfig extends ApplicationConfig = ApplicationConfig,
> {
  readonly appPackageName: string;
  readonly plugins: readonly ResolvedAppServerPlugin<TConfig>[];
}
