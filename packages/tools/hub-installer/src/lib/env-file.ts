import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { HUB_BASE_PATH, type Layout } from './layout.ts';

export interface HubEnvOptions {
  origin: string;
  host: string;
  port: number;
}

/**
 * Builds `hub.env`, the one set of runtime variables both pm2 and the installer's own CLI calls read.
 *
 * `APP_CONFIG_FILE` and `HUB_STORAGE_DIR` are absolute on purpose. A built server treats the directory above `dist/` as
 * its deployment root and keeps `config.yml` and `storage/` there by default, which here is the release directory an
 * upgrade replaces. `dist/.env` carries neither variable, so leaving one out silently moves the Hub's data into the
 * release.
 */
export function buildHubEnv(layout: Layout, options: HubEnvOptions): string {
  const entries: [string, string][] = [
    ['NODE_ENV', 'production'],
    ['APP_BASE_PATH', HUB_BASE_PATH],
    ['APP_CONFIG_FILE', layout.configFile],
    ['HUB_STORAGE_DIR', layout.storageDir],
    ['APP_PUBLIC_ORIGIN', options.origin],
    ['APP_SERVER_HOST', options.host],
    ['APP_SERVER_PORT', String(options.port)],
    // A failed start exits non-zero, so pm2 restarts it and the installer sees the failure.
    ['NOCOBASE_STRICT_STARTUP', 'true'],
  ];
  return [
    '# Written by hub-installer. Read by ecosystem.config.cjs and by every hub-installer command.',
    ...entries.map(([key, value]) => `${key}=${quote(value)}`),
    '',
  ].join('\n');
}

function quote(value: string): string {
  return /^[\w@%+=:,./-]*$/u.test(value) ? value : JSON.stringify(value);
}

export async function readHubEnv(
  layout: Layout,
): Promise<Record<string, string>> {
  return parseEnv(await readFile(layout.hubEnv, 'utf8')) as Record<
    string,
    string
  >;
}

/** The address the installer checks health on: the listening address, with a wildcard bind reached through loopback. */
export function healthUrl(env: Record<string, string>): string {
  const host = env.APP_SERVER_HOST ?? '127.0.0.1';
  const reachable =
    host === '0.0.0.0' || host === '::' || host === '' ? '127.0.0.1' : host;
  const hostPart = reachable.includes(':') ? `[${reachable}]` : reachable;
  return `http://${hostPart}:${env.APP_SERVER_PORT ?? '13000'}${HUB_BASE_PATH}/api/healthz`;
}
