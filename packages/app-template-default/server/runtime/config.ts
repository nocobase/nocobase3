import path from 'node:path';

import {
  createConfigEnv,
  createConfigPaths,
  loadConfig,
} from '@nocobase/app-server/config';

import configFactories, { type AppConfig } from '../config/index.js';
import type { AppScope, ResolvedAppRuntimeOptions } from './options.js';
import {
  createPluginMigrationSources,
  createPluginSeedSources,
  resolveAppPlugins,
} from '../plugins/index.js';
import {
  resolveEmbeddedRuntimeOptions,
  resolveStandaloneRuntimeOptions,
} from './options.js';

export function loadStandaloneAppConfig(moduleUrl: string): AppConfig {
  return loadAppConfig(resolveStandaloneRuntimeOptions(moduleUrl));
}

export function loadEmbeddedAppConfig(
  scope: AppScope,
  moduleUrl: string,
): AppConfig {
  return loadAppConfig(resolveEmbeddedRuntimeOptions(scope, moduleUrl));
}

export function loadAppConfig(options: ResolvedAppRuntimeOptions): AppConfig {
  const config = loadConfig(configFactories, {
    env: createConfigEnv(options.env),
    paths: createConfigPaths({
      rootDir: options.paths.rootDir,
      serverDir: options.paths.serverDir,
      databaseDir: options.paths.databaseDir,
      storageDir: options.paths.storageDir,
    }),
  });
  const resolvedPlugins = resolveAppPlugins(options.paths.rootDir);
  const appMigrationSource = {
    packageName: resolvedPlugins.appPackageName,
    directory: config.database.migrations.directory,
  };
  const appSeedSource = config.database.seeds
    ? {
        packageName: resolvedPlugins.appPackageName,
        directory: config.database.seeds.directory,
      }
    : undefined;
  const seedSources = appSeedSource
    ? [appSeedSource, ...createPluginSeedSources(resolvedPlugins.plugins)]
    : undefined;

  return {
    ...config,
    plugins: resolvedPlugins.plugins,
    database: {
      ...config.database,
      migrations: {
        ...config.database.migrations,
        packageName: resolvedPlugins.appPackageName,
        sources: [
          appMigrationSource,
          ...createPluginMigrationSources(resolvedPlugins.plugins),
        ],
      },
      seeds: config.database.seeds
        ? {
            ...config.database.seeds,
            packageName: resolvedPlugins.appPackageName,
            sources: seedSources,
          }
        : undefined,
    },
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
