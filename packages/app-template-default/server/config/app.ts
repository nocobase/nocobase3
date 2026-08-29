import { defineConfig } from '@nocobase/app-server-kit/config';
import {
  joinBasePath,
  normalizeBasePath,
  resolveAppNameFromBasePath,
} from '@nocobase/app-server-kit/support';
import type { AppRuntimeConfigFactory } from '@nocobase/app-server-kit/runtime';
import type {
  AppConfig,
  AppRoutingConfig,
  DefaultAppConfigContext,
  DefaultAppScopeConfig,
} from './types.js';

const appConfig: AppRuntimeConfigFactory<
  AppRoutingConfig,
  AppConfig,
  DefaultAppScopeConfig
> = defineConfig<AppRoutingConfig, DefaultAppConfigContext>(
  ({ env, routing, scopeConfig }): AppRoutingConfig => {
    const publicBasePath = normalizeBasePath(
      routing?.publicBasePath ?? env.string('APP_BASE_PATH', '/main'),
    );

    return {
      name: routing?.name ?? resolveAppNameFromBasePath(publicBasePath, 'main'),
      publicOrigin:
        scopeConfig?.publicOrigin ??
        resolvePublicOrigin(env.string('APP_PUBLIC_ORIGIN')),
      publicBasePath,
      internalBasePath: routing?.internalBasePath ?? '',
      publicApiUrl: joinBasePath(publicBasePath, '/api'),
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
