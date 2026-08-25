import path from 'node:path';

import {
  createConfigEnv,
  createConfigPaths,
  loadConfig,
  type ConfigContext,
} from '@nocobase/app-runtime/config';
import type { AppDatabaseConfig } from '@nocobase/app-runtime/database';
import type { AppQueueConfig } from '@nocobase/queue';

import configFactories, { type AppConfig } from '../config/index.js';
import databaseConfigFactory from '../config/database.js';
import type { AppScope, ResolvedAppRuntimeOptions } from './options.js';
import {
  createPluginMigrationSources,
  createPluginJobLocations,
  createPluginSeedSources,
  resolveAppPlugins,
  type ResolvedAppPlugin,
} from '../plugins/index.js';
import {
  resolveEmbeddedRuntimeOptions,
  resolveStandaloneRuntimeOptions,
} from './options.js';

export function loadStandaloneAppConfig(moduleUrl: string): AppConfig {
  return loadAppConfig(resolveStandaloneRuntimeOptions(moduleUrl));
}

export interface DatabaseTaskConfig {
  database: AppDatabaseConfig;
  plugins: readonly ResolvedAppPlugin[];
}

export function loadStandaloneDatabaseTaskConfig(
  moduleUrl: string,
): DatabaseTaskConfig {
  return loadDatabaseTaskConfig(resolveStandaloneRuntimeOptions(moduleUrl));
}

export function loadEmbeddedAppConfig(
  scope: AppScope,
  moduleUrl: string,
): AppConfig {
  return loadAppConfig(resolveEmbeddedRuntimeOptions(scope, moduleUrl));
}

export function loadAppConfig(options: ResolvedAppRuntimeOptions): AppConfig {
  const config = loadConfig(configFactories, createConfigContext(options));
  const databaseTaskConfig = resolveDatabaseTaskConfig(
    config.database,
    options.paths.rootDir,
  );

  return {
    ...config,
    ...databaseTaskConfig,
    queue: withPluginJobLocations(config.queue, databaseTaskConfig.plugins),
    app: {
      ...config.app,
      ...options.routing,
    },
    spa: {
      ...config.spa,
      indexPath: options.paths.clientDir
        ? path.join(options.paths.clientDir, 'index.html')
        : config.spa.indexPath,
    },
  };
}

function withPluginJobLocations(
  queue: AppQueueConfig,
  plugins: readonly ResolvedAppPlugin[],
): AppQueueConfig {
  return {
    ...queue,
    jobs: {
      ...queue.jobs,
      locations: [
        ...(queue.jobs?.locations ?? []),
        ...createPluginJobLocations(plugins),
      ],
    },
  };
}

export function loadDatabaseTaskConfig(
  options: ResolvedAppRuntimeOptions,
): DatabaseTaskConfig {
  return resolveDatabaseTaskConfig(
    databaseConfigFactory(createConfigContext(options)),
    options.paths.rootDir,
  );
}

function createConfigContext(
  options: ResolvedAppRuntimeOptions,
): ConfigContext {
  return {
    env: createConfigEnv(options.env),
    paths: createConfigPaths({
      rootDir: options.paths.rootDir,
      serverDir: options.paths.serverDir,
      databaseDir: options.paths.databaseDir,
      storageDir: options.paths.storageDir,
    }),
  };
}

function resolveDatabaseTaskConfig(
  database: AppDatabaseConfig,
  rootDir: string,
): DatabaseTaskConfig {
  const resolvedPlugins = resolveAppPlugins(rootDir);
  const appMigrationSource = {
    packageName: resolvedPlugins.appPackageName,
    directory: database.migrations.directory,
  };
  const appSeedSource = database.seeds
    ? {
        packageName: resolvedPlugins.appPackageName,
        directory: database.seeds.directory,
      }
    : undefined;
  const seedSources = appSeedSource
    ? [appSeedSource, ...createPluginSeedSources(resolvedPlugins.plugins)]
    : undefined;

  return {
    plugins: resolvedPlugins.plugins,
    database: {
      ...database,
      migrations: {
        ...database.migrations,
        packageName: resolvedPlugins.appPackageName,
        sources: [
          appMigrationSource,
          ...createPluginMigrationSources(resolvedPlugins.plugins),
        ],
      },
      seeds: database.seeds
        ? {
            ...database.seeds,
            packageName: resolvedPlugins.appPackageName,
            sources: seedSources,
          }
        : undefined,
    },
  };
}
