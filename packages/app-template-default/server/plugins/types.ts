import type {
  AppPluginBootstrap,
  AppPluginRoutesRegistrar,
} from '@nocobase/app-server/plugins';

export interface AppPluginRegistration {
  enabled: boolean;
}

export type AppPluginRegistry = Record<string, AppPluginRegistration>;

export interface AppPluginDatabaseManifest {
  migrations?: string;
  seeds?: string;
}

export interface AppPluginClientManifest {
  bootstrap?: string;
  routes?: string;
  providers?: string;
}

export interface AppPluginManifest {
  server?: string;
  client?: AppPluginClientManifest;
  database?: AppPluginDatabaseManifest;
}

export interface ResolvedAppPlugin {
  packageName: string;
  version: string;
  enabled: boolean;
  rootDir: string;
  manifest: AppPluginManifest;
  migrationsDirectory?: string;
  seedsDirectory?: string;
  jobsDirectory?: string;
  bootstrapEntry?: string;
  routesEntry?: string;
  clientBootstrapEntry?: string;
  clientRoutesEntry?: string;
  clientProvidersEntry?: string;
}

export interface LoadedAppPluginBootstrap {
  packageName: string;
  bootstrap: AppPluginBootstrap;
}

export interface LoadedAppPluginRoutes {
  packageName: string;
  registerRoutes: AppPluginRoutesRegistrar;
}
