export interface AppPluginRegistration {
  enabled: boolean;
}

export type AppPluginRegistry = Record<string, AppPluginRegistration>;

export interface AppPluginDatabaseManifest {
  migrations?: string;
  seeds?: string;
}

export interface AppPluginManifest {
  server?: string;
  client?: string;
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
}
