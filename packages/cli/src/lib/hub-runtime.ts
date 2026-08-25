import path from 'node:path';

import type { HubConfig } from './hub-project.ts';

export const DEFAULT_APP_HOST_PORT = 3000;
export const DEFAULT_HUB_BASE_PATH = '/hub';

export function createHubRuntimeEnvironment(
  config: HubConfig,
  directory: string,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  if (config.port === DEFAULT_APP_HOST_PORT) {
    throw new Error(
      `Hub cannot listen on port ${config.port}, because the bundled APP Host also uses port ${DEFAULT_APP_HOST_PORT}. Choose another Hub port with --port.`,
    );
  }

  const root = path.resolve(directory);
  return {
    ...baseEnvironment,
    APP_NAME: 'hub',
    APP_BASE_PATH: DEFAULT_HUB_BASE_PATH,
    APP_SERVER_HOST: config.host,
    APP_SERVER_PORT: String(config.port),
    APP_HOST_BIND: config.host,
    APP_HOST_PORT: String(DEFAULT_APP_HOST_PORT),
    AUTH_BASE_URL: `${hubOrigin(config.host, config.port)}${DEFAULT_HUB_BASE_PATH}/api/auth`,
    HUB_DATABASE_PATH: path.join(root, '.nocobase/hub.sqlite'),
    HUB_SOURCE_ROOT: path.join(root, '.nocobase/sources'),
    HUB_RELEASE_ROOT: path.join(root, 'app-dist'),
    APP_PUBLIC_ORIGIN: appHostOrigin(config.host, DEFAULT_APP_HOST_PORT),
  };
}

export function formatHubLocalEnvironment(
  config: HubConfig,
  authSecret: string,
): string {
  const publicHost =
    config.host === '0.0.0.0' || config.host === '::'
      ? '127.0.0.1'
      : formatUrlHost(config.host);
  return [
    'APP_NAME=hub',
    'APP_BASE_PATH=/hub',
    `APP_SERVER_HOST=${config.host}`,
    `APP_SERVER_PORT=${config.port}`,
    `APP_HOST_BIND=${config.host}`,
    `APP_HOST_PORT=${DEFAULT_APP_HOST_PORT}`,
    `AUTH_BASE_URL=${hubOrigin(config.host, config.port)}${DEFAULT_HUB_BASE_PATH}/api/auth`,
    `AUTH_SECRET=${authSecret}`,
    'HUB_DATABASE_PATH=.nocobase/hub.sqlite',
    'HUB_SOURCE_ROOT=.nocobase/sources',
    'HUB_RELEASE_ROOT=app-dist',
    `APP_PUBLIC_ORIGIN=http://${publicHost}:${DEFAULT_APP_HOST_PORT}`,
    '',
  ].join('\n');
}

function hubOrigin(host: string, port: number): string {
  const publicHost =
    host === '0.0.0.0' || host === '::' ? 'localhost' : formatUrlHost(host);
  return `http://${publicHost}:${port}`;
}

function appHostOrigin(host: string, port: number): string {
  const publicHost =
    host === '0.0.0.0' || host === '::' ? 'localhost' : formatUrlHost(host);
  return `http://${publicHost}:${port}`;
}

function formatUrlHost(host: string): string {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}
