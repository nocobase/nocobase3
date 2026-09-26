import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { HUB_BASE_PATH, type Layout } from './layout.ts';

export interface HubEnvOptions {
  origin: string;
  host: string;
  port: number;
}

/**
 * Builds `hub.env`, the one set of runtime variables both the Hub and the installer's own CLI calls read. `launcher.mjs`
 * reads it on every start, so an edit takes effect with `pm2 restart`.
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
    '# Written by hub-installer. Read by launcher.mjs on every start and by every hub-installer command.',
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

export interface HubEndpoints {
  /** Where people open the Hub: the public origin followed by the Hub's base path. */
  url: string;
  /** `APP_PUBLIC_ORIGIN`, which the Hub builds its links from, without a trailing slash. */
  origin: string;
  /** `APP_SERVER_HOST` and `APP_SERVER_PORT`, where the Hub listens and a reverse proxy forwards to. */
  host: string;
  /** `null` when `APP_SERVER_PORT` is not a port number, which the Hub cannot listen on either. */
  port: number | null;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = '13000';

function parsePort(value: string): number | null {
  const port = Number(value.trim());
  return value.trim() !== '' &&
    Number.isInteger(port) &&
    port >= 1 &&
    port <= 65535
    ? port
    : null;
}

/**
 * Where the Hub is reached and where it listens, as `hub.env` says. The file is edited by hand to change either, so a
 * trailing slash on the origin is dropped, as `install` drops it from `--origin`, and a port that is not one reads as
 * `null` rather than as a number the Hub is not using.
 */
export function endpointsOf(env: Record<string, string>): HubEndpoints {
  const host = env.APP_SERVER_HOST ?? DEFAULT_HOST;
  const rawPort = env.APP_SERVER_PORT ?? DEFAULT_PORT;
  const origin = (env.APP_PUBLIC_ORIGIN ?? `http://${host}:${rawPort}`).replace(
    /\/+$/u,
    '',
  );
  return {
    url: `${origin}${HUB_BASE_PATH}/`,
    origin,
    host,
    port: parsePort(rawPort),
  };
}

/** The address the installer checks health on: the listening address, with a wildcard bind reached through loopback. */
export function healthUrl(env: Record<string, string>): string {
  const { host, port } = endpointsOf(env);
  const reachable =
    host === '0.0.0.0' || host === '::' || host === '' ? '127.0.0.1' : host;
  const hostPart = reachable.includes(':') ? `[${reachable}]` : reachable;
  return `http://${hostPart}:${port ?? env.APP_SERVER_PORT}${HUB_BASE_PATH}/api/healthz`;
}
