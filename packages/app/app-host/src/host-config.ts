/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

import { Config, type ConfigMap } from '@nocobase/config';
import { jsonParser } from '@nocobase/config/parsers/json';
import { yamlParser } from '@nocobase/config/parsers/yaml';
import {
  envInteger,
  envBoolean,
  envString,
  environmentProvider,
  type Environment,
} from '@nocobase/config/providers/env';
import {
  fileProvider,
  type FileProviderOptions,
} from '@nocobase/config/providers/file';
import { objectProvider } from '@nocobase/config/providers/object';
import type { AppDriveDiskConfig } from '@nocobase/drive';
import type { LoggingConfig } from '@nocobase/logging';

import type { AppHostMode } from './host-mode.ts';

export interface AppHostConfig {
  mode: AppHostMode;
  server: {
    host: string;
    port: number;
  };
  artifact: AppDriveDiskConfig;
  logging: LoggingConfig;
  appDeploymentsDir: string;
  appVolumesDir: string;
  maxActiveApps?: number;
  idleTtlMs?: number;
  evictionIntervalMs?: number;
}

export interface LoadAppHostConfigOptions {
  configPath?: string;
  rootDir?: string;
  environment?: Environment;
}

const DEFAULT_CONFIG_BASENAME = 'config';

export async function loadAppHostConfig(
  options: LoadAppHostConfigOptions = {},
): Promise<AppHostConfig> {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const environment = options.environment ?? process.env;
  const configuredPath = options.configPath ?? environment.APP_HOST_CONFIG_PATH;
  const configPath = resolveAppHostConfigPath(
    configuredPath
      ? path.resolve(rootDir, configuredPath)
      : path.join(rootDir, DEFAULT_CONFIG_BASENAME),
  );
  const config = new Config({ strictMerge: true });

  await config.load(
    objectProvider({
      host: {
        mode: 'standalone',
        server: { host: '127.0.0.1', port: 3000 },
        artifact: {
          driver: 'fs',
          location: path.join(rootDir, 'storage', 'app-artifacts'),
          visibility: 'private',
        },
        logging: createDefaultHostLoggingConfig(rootDir, environment.NODE_ENV),
        appDeploymentsDir: path.join(rootDir, 'storage', 'app-deployments'),
        appVolumesDir: path.join(rootDir, 'storage', 'app-volumes'),
      },
    }),
  );
  await loadFile(config, configPath, {
    optional: configuredPath === undefined,
  });
  await config.load(
    environmentProvider(environment, {
      mappings: {
        APP_HOST_MODE: envString('host.mode'),
        APP_HOST_BIND: envString('host.server.host'),
        APP_HOST_PORT: envInteger('host.server.port'),
        PORT: envInteger('host.server.port'),
        APP_DEPLOYMENTS_DIR: envString('host.appDeploymentsDir'),
        APP_VOLUMES_DIR: envString('host.appVolumesDir'),
        MAX_ACTIVE_APPS: envInteger('host.maxActiveApps'),
        APP_IDLE_TTL_MS: envInteger('host.idleTtlMs'),
        APP_EVICTION_INTERVAL_MS: envInteger('host.evictionIntervalMs'),
        APP_HOST_ARTIFACT_DRIVER: envString('host.artifact.driver'),
        APP_HOST_ARTIFACT_LOCATION: envString('host.artifact.location'),
        APP_HOST_ARTIFACT_BUCKET: envString('host.artifact.bucket'),
        APP_HOST_ARTIFACT_REGION: envString('host.artifact.region'),
        APP_HOST_ARTIFACT_ENDPOINT: envString('host.artifact.endpoint'),
        APP_HOST_ARTIFACT_FORCE_PATH_STYLE: envBoolean(
          'host.artifact.forcePathStyle',
        ),
        APP_HOST_ARTIFACT_SUPPORTS_ACL: envBoolean('host.artifact.supportsACL'),
        APP_HOST_ARTIFACT_ACCESS_KEY_ID: envString(
          'host.artifact.credentials.accessKeyId',
        ),
        APP_HOST_ARTIFACT_SECRET_ACCESS_KEY: envString(
          'host.artifact.credentials.secretAccessKey',
        ),
        APP_HOST_LOG_LEVEL: envString('host.logging.level'),
      },
    }),
  );
  return decodeAppHostConfig(config, rootDir);
}

export function resolveAppHostConfigPath(configPath: string): string {
  if (path.extname(configPath)) {
    return configPath;
  }
  const candidates = ['.yml', '.yaml', '.json'].map(
    (extension) => `${configPath}${extension}`,
  );
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

async function loadFile(
  config: Config,
  configPath: string,
  options: FileProviderOptions = {},
): Promise<void> {
  const extension = path.extname(configPath).toLowerCase();
  const parser =
    extension === '.yml' || extension === '.yaml'
      ? yamlParser()
      : extension === '.json'
        ? jsonParser()
        : undefined;
  if (!parser) {
    throw new Error(
      `Unsupported app-host config extension "${extension || '(none)'}". Expected .yml, .yaml, or .json.`,
    );
  }
  await config.load(fileProvider(configPath, options), parser);
}

function decodeAppHostConfig(config: Config, rootDir: string): AppHostConfig {
  const hostConfig = config.cut('host');
  const mode = hostConfig.string('mode');
  if (mode !== 'standalone' && mode !== 'managed') {
    throw new Error(
      'Invalid app-host config: host.mode must be "standalone" or "managed"',
    );
  }
  const host = required(hostConfig.string('server.host'), 'host.server.host');
  const port = positiveInteger(hostConfig, 'server.port');
  const appDeploymentsDir = resolveConfigDirectory(
    required(hostConfig.string('appDeploymentsDir'), 'host.appDeploymentsDir'),
    rootDir,
  );
  const appVolumesDir = resolveConfigDirectory(
    required(hostConfig.string('appVolumesDir'), 'host.appVolumesDir'),
    rootDir,
  );
  const artifactConfig = hostConfig.cut('artifact');
  const artifactDriver = artifactConfig.string('driver');
  if (artifactDriver !== 'fs' && artifactDriver !== 's3') {
    throw new Error(
      'Invalid app-host config: host.artifact.driver must be "fs" or "s3"',
    );
  }
  const artifact = {
    ...artifactConfig.raw(),
    driver: artifactDriver,
  } as AppDriveDiskConfig;
  if (artifact.driver === 'fs') {
    artifact.location = resolveConfigDirectory(artifact.location, rootDir);
  }

  return {
    mode,
    server: { host, port },
    artifact,
    logging: { ...hostConfig.cut('logging').raw() },
    appDeploymentsDir,
    appVolumesDir,
    maxActiveApps: optionalPositiveInteger(hostConfig, 'maxActiveApps'),
    idleTtlMs: optionalNonNegativeInteger(hostConfig, 'idleTtlMs'),
    evictionIntervalMs: optionalNonNegativeInteger(
      hostConfig,
      'evictionIntervalMs',
    ),
  };
}

function createDefaultHostLoggingConfig(
  rootDir: string,
  nodeEnv: string | undefined,
): ConfigMap {
  const config: ConfigMap = {
    default: 'host',
    name: 'app-host',
    level: 'info',
    base: { service: 'app-host' },
  };
  if (nodeEnv === 'production') {
    return {
      ...config,
      transport: {
        target: 'pino-roll',
        options: {
          file: path.join(rootDir, 'storage', 'host', 'logs', '{logger}.log'),
          frequency: 'daily',
          dateFormat: 'yyyy_MM_dd',
          mkdir: true,
          limit: { count: 6, removeOtherLogFiles: true },
        },
      },
    };
  }
  return {
    ...config,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        singleLine: true,
      },
    },
  };
}

function resolveConfigDirectory(value: string, rootDir: string): string {
  return path.resolve(rootDir, value);
}

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined || value === '') {
    throw new Error(`Invalid app-host config: ${name} is required`);
  }
  return value;
}

function positiveInteger(config: Config, name: string): number {
  const value = config.integer(name);
  if (value === undefined || value <= 0) {
    throw new Error(
      `Invalid app-host config: host.${name} must be a positive integer`,
    );
  }
  return value;
}

function optionalPositiveInteger(
  config: Config,
  name: string,
): number | undefined {
  return config.has(name) ? positiveInteger(config, name) : undefined;
}

function optionalNonNegativeInteger(
  config: Config,
  name: string,
): number | undefined {
  const value = config.integer(name);
  if (value === undefined) return undefined;
  if (value < 0) {
    throw new Error(
      `Invalid app-host config: host.${name} must be a non-negative integer`,
    );
  }
  return value;
}
