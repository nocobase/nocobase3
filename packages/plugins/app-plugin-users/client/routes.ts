import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { UsersRound } from 'lucide-react';

import type { UsersClientOptions } from './plugin.js';

export const USERS_ROUTE_ID = '@nocobase/app-plugin-users:users';
export const USERS_PAGE_ACCESS = {
  resource: 'users',
  action: 'access',
} as const;

export function createUsersRoutes(
  options: UsersClientOptions,
): AppClientRouteContribution {
  const path = normalizeUsersRoutePath(options.path ?? '/users');
  const page = {
    name: 'users',
    path,
    access: USERS_PAGE_ACCESS,
    componentLoader: () => import('./pages/users-page.js'),
  } as const;
  if ((options.mount ?? 'settings') === 'app') {
    return defineAppRoutes([
      {
        ...page,
        auth: 'required',
        navigation: { title: options.title ?? 'nav.users', icon: UsersRound },
      },
    ]);
  }
  return defineSettingsRoutes([
    {
      ...page,
      navigation: { title: options.title ?? 'nav.users', icon: UsersRound },
    },
  ]);
}

export function normalizeUsersRoutePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') {
    throw new TypeError('Users route path must contain a path segment');
  }
  const path = `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
  if (path === '/settings' || path.startsWith('/settings/')) {
    throw new TypeError(
      'Users route path is relative to its mount and must not include /settings',
    );
  }
  return path;
}
