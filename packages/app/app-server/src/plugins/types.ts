import type {
  ServiceContainer,
  ServiceProviderLifecycle,
} from '@nocobase/service-provider';
import type { Hono } from 'hono';
import type { AppConfigAccessor } from '../config/index.js';
import type { LocalesModule } from '@nocobase/i18n';

import type { ConfigPaths } from '../config/index.js';
import type { AppRouteContribution } from '../router/index.js';

export interface AppPluginApplication<TConfig = object> {
  readonly appName: string;
  /**
   * Whether this app owns the process it runs in, or is one of several an
   * app host mounted. Optional so an app composed by hand need not state it,
   * and absent means embedded, matching what `Application` itself defaults to.
   */
  readonly mode?: 'standalone' | 'embedded';
  readonly publicBasePath: string;
  readonly config: AppConfigAccessor & Partial<Record<never, TConfig>>;
  readonly paths: ConfigPaths;
  readonly router: Hono;
  readonly container: ServiceContainer;
}

export interface AppPluginProviderConstructor<TConfig = object> {
  new (app: AppPluginApplication): ServiceProviderLifecycle;
  readonly __config?: TConfig;
}

export interface AppServerPluginDatabaseContribution {
  readonly migrations?: string;
  readonly seeds?: string;
}

export interface AppServerPluginQueueContribution {
  readonly jobs?: readonly string[];
}

export type AppServerPluginLocalesLoader = () => Promise<LocalesModule>;

export interface AppServerPluginDefinition<TConfig = object> {
  readonly packageName: string;
  /** Absolute base directory for plugin-local contribution paths. */
  readonly baseDir: string;
  readonly serviceProviders?: readonly AppPluginProviderConstructor<TConfig>[];
  readonly routes?: readonly AppRouteContribution<AppPluginApplication>[];
  readonly database?: AppServerPluginDatabaseContribution;
  readonly queue?: AppServerPluginQueueContribution;
  readonly locales?: AppServerPluginLocalesLoader;
}

export interface AppServerPlugin<TConfig = object> {
  readonly packageName: string;
  /** Absolute base directory for plugin-local contribution paths. */
  readonly baseDir: string;
  readonly serviceProviders: readonly AppPluginProviderConstructor<TConfig>[];
  readonly routes: readonly AppRouteContribution<AppPluginApplication>[];
  readonly database?: AppServerPluginDatabaseContribution;
  readonly queue?: AppServerPluginQueueContribution;
  readonly locales?: AppServerPluginLocalesLoader;
  readonly __config?: TConfig;
}

export interface AppServerPlugins {
  readonly plugins: readonly AppServerPlugin[];
}

export interface ResolvedAppPlugin {
  readonly packageName: string;
  /** Absolute base directory for plugin-local contribution paths. */
  readonly baseDir: string;
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
