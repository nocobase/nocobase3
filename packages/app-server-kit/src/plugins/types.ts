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

export interface AppPluginRegistration {
  readonly enabled: boolean;
}

export type AppPluginRegistry = Record<string, AppPluginRegistration>;

export interface AppPluginDatabaseManifest {
  readonly migrations?: string;
  readonly seeds?: string;
}

export interface AppPluginClientManifest {
  readonly bootstrap?: string;
  readonly routes?: string;
  readonly providers?: string;
}

export interface AppPluginManifest {
  readonly server?: string;
  readonly client?: AppPluginClientManifest;
  readonly database?: AppPluginDatabaseManifest;
}

export interface ResolvedAppPlugin {
  readonly packageName: string;
  readonly version: string;
  readonly enabled: boolean;
  readonly rootDir: string;
  readonly manifest: AppPluginManifest;
  readonly migrationsDirectory?: string;
  readonly seedsDirectory?: string;
  readonly jobsDirectory?: string;
  readonly bootstrapEntry?: string;
  readonly routesEntry?: string;
  readonly clientBootstrapEntry?: string;
  readonly clientRoutesEntry?: string;
  readonly clientProvidersEntry?: string;
}

export interface ResolvedAppPlugins {
  readonly appPackageName: string;
  readonly plugins: readonly ResolvedAppPlugin[];
}

export interface LoadedAppPluginBootstrap {
  readonly packageName: string;
  readonly bootstrap: AppPluginBootstrap;
}

export interface LoadedAppPluginRoutes {
  readonly packageName: string;
  readonly registerRoutes: AppPluginRoutesRegistrar;
}
