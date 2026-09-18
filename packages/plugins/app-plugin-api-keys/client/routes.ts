import {
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { KeyRound } from 'lucide-react';

import type { ApiKeysClientOptions } from './plugin.js';

export const API_KEYS_ROUTE_ID = '@nocobase/app-plugin-api-keys:api-keys';

/**
 * The permission that opens the page.
 *
 * Keys are self-service — the endpoints behind the page only ever act on the
 * caller's own keys — so an application that wants every signed-in user to
 * manage their own grants `page:api-keys/access` to all authenticated users.
 * It is still declared rather than omitted, so that decision is made in the
 * application's permissions rather than by the absence of a rule.
 */
export const API_KEYS_PAGE_ACCESS = {
  resource: { type: 'page', id: 'api-keys' },
  action: 'access',
} as const;

export function createApiKeysRoutes(
  options: ApiKeysClientOptions,
): AppClientRouteContribution {
  return defineSettingsRoutes([
    {
      name: 'api-keys',
      path: normalizeApiKeysRoutePath(options.path ?? '/api-keys'),
      authz: API_KEYS_PAGE_ACCESS,
      componentLoader: () => import('./pages/api-keys-page.js'),
      navigation: {
        title: options.title ?? 'nav.apiKeys',
        icon: KeyRound,
      },
    },
  ]);
}

export function normalizeApiKeysRoutePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') {
    throw new TypeError('API keys route path must contain a path segment');
  }
  const path = `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
  if (path === '/settings' || path.startsWith('/settings/')) {
    throw new TypeError(
      'API keys route path is relative to its mount and must not include /settings',
    );
  }
  return path;
}
