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

import { Config, type ConfigMap, type ConfigValue } from '@nocobase/config';
import { jsonParser } from '@nocobase/config/parsers/json';
import { yamlParser } from '@nocobase/config/parsers/yaml';
import {
  envInteger,
  envBoolean,
  envString,
  environmentProvider,
  type Environment,
} from '@nocobase/config/providers/env';
import { fileProvider } from '@nocobase/config/providers/file';
import { objectProvider } from '@nocobase/config/providers/object';
import type { AppDriveDiskConfig } from '@nocobase/drive';

import type { AppHostMode } from './host-mode.ts';

export interface AppHostConfig {
  mode: AppHostMode;
  server: {
    host: string;
    port: number;
  };
  artifact: AppDriveDiskConfig;
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
  overrides?: Partial<AppHostConfig>;
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
        appDeploymentsDir: path.join(rootDir, 'storage', 'app-deployments'),
        appVolumesDir: path.join(rootDir, 'storage', 'app-volumes'),
      },
    }),
  );
  await config.load(
    fileProvider(configPath, { optional: configuredPath === undefined }),
    configParser(configPath),
  );
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
      },
    }),
  );
  if (options.overrides) {
    await config.load(objectProvider({ host: toConfigMap(options.overrides) }));
  }

  return decodeAppHostConfig(config.get('host'), rootDir);
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

function configParser(configPath: string): ReturnType<typeof yamlParser> {
  const extension = path.extname(configPath).toLowerCase();
  if (extension === '.yml' || extension === '.yaml') {
    return yamlParser();
  }
  if (extension === '.json') {
    return jsonParser();
  }
  throw new Error(
    `Unsupported app-host config extension "${extension || '(none)'}". Expected .yml, .yaml, or .json.`,
  );
}

function decodeAppHostConfig(value: unknown, rootDir: string): AppHostConfig {
  if (!isRecord(value)) {
    throw new Error('Invalid app-host config: host must be an object');
  }
  const server = requireRecord(value.server, 'host.server');
  const artifact = requireRecord(value.artifact, 'host.artifact');
  const mode = value.mode;
  if (mode !== 'standalone' && mode !== 'managed') {
    throw new Error(
      'Invalid app-host config: host.mode must be "standalone" or "managed"',
    );
  }
  const host = requireString(server.host, 'host.server.host');
  const port = requirePositiveInteger(server.port, 'host.server.port');
  const appDeploymentsDir = resolveConfigDirectory(
    requireString(value.appDeploymentsDir, 'host.appDeploymentsDir'),
    rootDir,
  );
  const appVolumesDir = resolveConfigDirectory(
    requireString(value.appVolumesDir, 'host.appVolumesDir'),
    rootDir,
  );

  return {
    mode,
    server: { host, port },
    artifact: decodeArtifactConfig(artifact, rootDir),
    appDeploymentsDir,
    appVolumesDir,
    maxActiveApps: optionalPositiveInteger(
      value.maxActiveApps,
      'host.maxActiveApps',
    ),
    idleTtlMs: optionalNonNegativeInteger(value.idleTtlMs, 'host.idleTtlMs'),
    evictionIntervalMs: optionalNonNegativeInteger(
      value.evictionIntervalMs,
      'host.evictionIntervalMs',
    ),
  };
}

function decodeArtifactConfig(
  value: Record<string, unknown>,
  rootDir: string,
): AppDriveDiskConfig {
  if (value.driver === 'fs') {
    return {
      driver: 'fs',
      location: resolveConfigDirectory(
        requireString(value.location, 'host.artifact.location'),
        rootDir,
      ),
      visibility: decodeVisibility(value.visibility),
      ...(typeof value.url === 'string' ? { url: value.url } : {}),
    };
  }
  if (value.driver === 's3') {
    const credentials = isRecord(value.credentials) ? value.credentials : {};
    return {
      driver: 's3',
      bucket: requireString(value.bucket, 'host.artifact.bucket'),
      region: requireString(value.region, 'host.artifact.region'),
      endpoint: optionalString(value.endpoint, 'host.artifact.endpoint'),
      cdnUrl: optionalString(value.cdnUrl, 'host.artifact.cdnUrl'),
      forcePathStyle: requireBoolean(
        value.forcePathStyle,
        'host.artifact.forcePathStyle',
      ),
      supportsACL: requireBoolean(
        value.supportsACL,
        'host.artifact.supportsACL',
      ),
      encryption: optionalString(value.encryption, 'host.artifact.encryption'),
      credentials: {
        accessKeyId: optionalString(
          credentials.accessKeyId,
          'host.artifact.credentials.accessKeyId',
        ),
        secretAccessKey: optionalString(
          credentials.secretAccessKey,
          'host.artifact.credentials.secretAccessKey',
        ),
      },
      visibility: decodeVisibility(value.visibility),
    };
  }
  throw new Error(
    'Invalid app-host config: host.artifact.driver must be "fs" or "s3"',
  );
}

function resolveConfigDirectory(value: string, rootDir: string): string {
  return path.resolve(rootDir, value);
}

function decodeVisibility(value: unknown): 'public' | 'private' {
  if (value === 'public' || value === 'private') return value;
  throw new Error(
    'Invalid app-host config: artifact visibility must be "public" or "private"',
  );
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value))
    throw new Error(`Invalid app-host config: ${name} must be an object`);
  return value;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `Invalid app-host config: ${name} must be a non-empty string`,
    );
  }
  return value;
}

function optionalString(value: unknown, name: string): string | undefined {
  return value === undefined ? undefined : requireString(value, name);
}

function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean')
    throw new Error(`Invalid app-host config: ${name} must be a boolean`);
  return value;
}

function requirePositiveInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(
      `Invalid app-host config: ${name} must be a positive integer`,
    );
  }
  return value as number;
}

function optionalPositiveInteger(
  value: unknown,
  name: string,
): number | undefined {
  return value === undefined ? undefined : requirePositiveInteger(value, name);
}

function optionalNonNegativeInteger(
  value: unknown,
  name: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(
      `Invalid app-host config: ${name} must be a non-negative integer`,
    );
  }
  return value as number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toConfigMap(value: object): ConfigMap {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, toConfigValue(entry)]),
  );
}

function toConfigValue(value: unknown): ConfigValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toConfigValue);
  }
  if (isRecord(value)) {
    return toConfigMap(value);
  }
  throw new Error('App-host config overrides contain an unsupported value');
}
