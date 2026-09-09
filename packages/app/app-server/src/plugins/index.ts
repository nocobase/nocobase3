export { defineServerPlugin, defineServerPlugins } from './define.js';
export {
  inspectResolvedAppServerPlugins,
  type AppServerDatabaseSnapshot,
  type AppServerInspectionIssue,
  type AppServerInspectionSnapshot,
  type AppServerJobsSnapshot,
  type AppServerPluginSnapshot,
  type AppServerProviderSnapshot,
  type AppServerRouteSnapshot,
  type AppServerSchedulesSnapshot,
} from './inspect.js';
export {
  createAppPluginDatabaseConfig,
  createPluginJobLocations,
  createPluginMigrationSources,
  createPluginSeedSources,
  resolveAppPluginDatabaseConfig,
  resolveAppServerPlugins,
  type ResolveAppServerPluginsOptions,
  type ResolvedAppPluginDatabaseConfig,
} from './resolve.js';
export type * from './types.js';
export * from './schedules.js';

import type { Hono } from 'hono';
import type { ConfigPaths } from '../config/types.js';

export interface AppPluginRoutesContext<
  TDeps = unknown,
  TServices = unknown,
  TConfig = unknown,
> {
  readonly app: Hono;
  readonly config: TConfig;
  readonly deps: TDeps;
  readonly services: TServices;
  readonly paths: ConfigPaths;
}

export type AppPluginDisposer = () => void | Promise<void>;

export interface AppPluginLifecycle {
  registerDisposer(name: string, dispose: AppPluginDisposer): void;
}

export interface AppPluginServerContext<
  TDeps = unknown,
  TServices = unknown,
  TConfig = unknown,
> {
  readonly config: TConfig;
  readonly deps: TDeps;
  readonly services: TServices;
  readonly lifecycle: AppPluginLifecycle;
  readonly paths: ConfigPaths;
}

export type AppPluginBootstrap<
  TDeps = unknown,
  TServices = unknown,
  TConfig = unknown,
> = (context: AppPluginServerContext<TDeps, TServices, TConfig>) => void;

export type AppPluginRoutesRegistrar<
  TDeps = unknown,
  TServices = unknown,
  TConfig = unknown,
> = (context: AppPluginRoutesContext<TDeps, TServices, TConfig>) => void;
