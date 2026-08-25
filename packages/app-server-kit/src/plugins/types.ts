import type { Hono } from 'hono';

export interface AppPluginRoutesContext<TDeps = unknown, TServices = unknown> {
  readonly app: Hono;
  readonly deps: TDeps;
  readonly services: TServices;
}

export type AppPluginDisposer = () => void | Promise<void>;

export interface AppPluginLifecycle {
  registerDisposer(name: string, dispose: AppPluginDisposer): void;
}

export interface AppPluginServerContext<TDeps = unknown, TServices = unknown> {
  readonly deps: TDeps;
  readonly services: TServices;
  readonly lifecycle: AppPluginLifecycle;
}

export type AppPluginBootstrap<TDeps = unknown, TServices = unknown> = (
  context: AppPluginServerContext<TDeps, TServices>,
) => void;

export type AppPluginRoutesRegistrar<TDeps = unknown, TServices = unknown> = (
  context: AppPluginRoutesContext<TDeps, TServices>,
) => void;

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
