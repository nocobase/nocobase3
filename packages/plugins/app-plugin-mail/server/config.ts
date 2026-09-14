import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import { joinBasePath, normalizeBasePath } from '@nocobase/app-server/support';

export interface MailProviderConfigEntry {
  readonly type: string;
  readonly enabled?: boolean;
}

export const DEFAULT_MAIL_SYNC_BATCH_SIZE = 100;
export const MAX_MAIL_SYNC_BATCH_SIZE = 200;
export const DEFAULT_MAIL_OAUTH_CALLBACK_PATH = '/mail/oauth/callback';

const MAIL_CALLBACK_URL_BASE = 'https://mail-callback.invalid';
const MAIL_LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export interface MailConfig {
  readonly oauthCallbackUrl?: string;
  readonly automaticSyncIntervalMs: number;
  readonly syncBatchSize: number;
  readonly pushWebhookUrl?: string;
  readonly pushWebhookSecret?: string;
  readonly providers: Readonly<Record<string, MailProviderConfigEntry>>;
}

export const DEFAULT_MAIL_CONFIG: MailConfig = Object.freeze({
  oauthCallbackUrl: DEFAULT_MAIL_OAUTH_CALLBACK_PATH,
  automaticSyncIntervalMs: 300_000,
  syncBatchSize: DEFAULT_MAIL_SYNC_BATCH_SIZE,
  providers: {},
});

/** Application-owned default configuration factory for the Mail module. */
export const mailConfig: AppConfigFactory<MailConfig> = defineAppConfig(
  (_runtime) => DEFAULT_MAIL_CONFIG,
);

export function resolveMailOAuthOrigin(
  configuredOrigin: string | undefined,
  requestOrigin: string,
): string {
  const configured = configuredOrigin?.trim();
  if (!configured) return requestOrigin;

  try {
    const configuredUrl = new URL(configured);
    const requestUrl = new URL(requestOrigin);
    if (
      configuredUrl.protocol === requestUrl.protocol &&
      configuredUrl.port === requestUrl.port &&
      isMailLoopbackHost(configuredUrl.hostname) &&
      isMailLoopbackHost(requestUrl.hostname)
    ) {
      return requestUrl.origin;
    }
  } catch {
    // Keep the configured origin. Its validation belongs to the app config.
  }

  return configured;
}

export function resolveMailOAuthCallbackUrl(
  configuredUrl: string | undefined,
  origin: string,
  publicBasePath: string,
): string {
  const value = configuredUrl?.trim() || DEFAULT_MAIL_OAUTH_CALLBACK_PATH;
  const absolute = parseAbsoluteMailUrl(value);
  if (absolute) {
    resolveMailOAuthCallbackPath(value, publicBasePath);
    return absolute.toString();
  }

  const relative = parseRelativeMailUrl(value);
  const resolved = new URL(
    joinBasePath(publicBasePath, relative.pathname),
    origin,
  );
  resolved.search = relative.search;
  return resolved.toString();
}

export function resolveMailOAuthCallbackPath(
  configuredUrl: string | undefined,
  publicBasePath: string,
): string {
  const value = configuredUrl?.trim() || DEFAULT_MAIL_OAUTH_CALLBACK_PATH;
  const absolute = parseAbsoluteMailUrl(value);
  if (!absolute) {
    return normalizeBasePath(parseRelativeMailUrl(value).pathname) || '/';
  }

  const pathname = normalizeBasePath(absolute.pathname) || '/';
  const basePath = normalizeBasePath(publicBasePath);
  if (
    basePath &&
    pathname !== basePath &&
    !pathname.startsWith(`${basePath}/`)
  ) {
    throw new TypeError(
      `Mail OAuth callback URL must include application public base path "${basePath}".`,
    );
  }
  return (
    normalizeBasePath(basePath ? pathname.slice(basePath.length) : pathname) ||
    '/'
  );
}

function parseAbsoluteMailUrl(value: string): URL | undefined {
  if (!/^[a-z][a-z\d+.-]*:/iu.test(value)) return undefined;
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError(
      'Mail OAuth callback URL must use the http or https protocol.',
    );
  }
  assertNoCallbackUrlFragment(url);
  return url;
}

function parseRelativeMailUrl(value: string): URL {
  const url = new URL(value, MAIL_CALLBACK_URL_BASE);
  if (url.origin !== MAIL_CALLBACK_URL_BASE) {
    throw new TypeError(
      'Mail OAuth callback URL must be an app-local path or an absolute http(s) URL.',
    );
  }
  assertNoCallbackUrlFragment(url);
  return url;
}

function assertNoCallbackUrlFragment(url: URL): void {
  if (url.hash) {
    throw new TypeError(
      'Mail OAuth callback URL must not contain a URL fragment.',
    );
  }
}

function isMailLoopbackHost(hostname: string): boolean {
  return MAIL_LOOPBACK_HOSTS.has(
    hostname.replace(/^\[|\]$/g, '').toLowerCase(),
  );
}

export function resolveMailSyncBatchSize(value?: number): number {
  const resolved = value ?? DEFAULT_MAIL_SYNC_BATCH_SIZE;
  if (
    !Number.isSafeInteger(resolved) ||
    resolved < 1 ||
    resolved > MAX_MAIL_SYNC_BATCH_SIZE
  ) {
    throw new TypeError(
      `Mail syncBatchSize must be an integer from 1 through ${MAX_MAIL_SYNC_BATCH_SIZE}.`,
    );
  }
  return resolved;
}
