import {
  defineConfig,
  type ConfigFactory,
} from '@nocobase/app-server-kit/config';
import {
  joinBasePath,
  normalizeBasePath,
  resolveAppNameFromBasePath,
} from '@nocobase/app-server-kit/support';
import type { AppRoutingConfig } from './types.js';

const appConfig: ConfigFactory<AppRoutingConfig> = defineConfig(
  ({ env }): AppRoutingConfig => {
    const publicBasePath = normalizeBasePath(
      env.string('APP_BASE_PATH', '/main'),
    );
    const internalApiProxyPath = '/v2/api';

    return {
      name: resolveAppNameFromBasePath(publicBasePath, 'main'),
      publicOrigin: resolvePublicOrigin(env.string('APP_PUBLIC_ORIGIN')),
      publicBasePath,
      internalBasePath: '',
      internalApiProxyPath,
      publicApiUrl: joinBasePath(publicBasePath, internalApiProxyPath),
      nocoBaseApiUrl: env.string('NOCOBASE_API_PROXY_TARGET'),
    };
  },
);

export default appConfig;

export function resolvePublicOrigin(
  value: string | undefined,
): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error('APP_PUBLIC_ORIGIN must be a valid absolute URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('APP_PUBLIC_ORIGIN must use http or https.');
  }
  if (url.username || url.password) {
    throw new Error('APP_PUBLIC_ORIGIN must not include credentials.');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(
      'APP_PUBLIC_ORIGIN must contain only the protocol, host, and optional port.',
    );
  }

  return url.origin;
}
