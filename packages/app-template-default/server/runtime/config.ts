import path from 'node:path';

import {
  createConfigEnv,
  createConfigPaths,
  loadConfig,
} from '@nocobase/app-server/config';

import configFactories, { type AppConfig } from '../config/index.js';
import type { AppScope, ResolvedAppRuntimeOptions } from './options.js';
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
      storageDir: options.paths.storageDir,
    }),
  });

  return {
    ...config,
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
    drive: {
      ...config.drive,
      links: options.mode === 'embedded' ? {} : config.drive.links,
    },
  };
}
