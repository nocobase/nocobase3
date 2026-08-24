import { createHash } from 'node:crypto';

import type { Context } from 'hono';

export function createScopedRouteIdentity(
  audience: string,
  routeType: 'field' | 'relation',
  binding: Readonly<Record<string, string | number>>,
): string {
  const entries = Object.entries(binding).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return createHash('sha256')
    .update('nocobase-files-scoped-route-v1\0')
    .update(JSON.stringify({ audience, routeType, binding: entries }))
    .digest('base64url');
}

export function readScopedRoutePath(context: Context): string {
  const path = context.req.path.replace(/\/+$/, '');
  if (!path) {
    throw new Error('Mounted file route path is invalid.');
  }
  const fileId = context.req.param('fileId');
  if (!fileId) {
    return path;
  }
  const marker = `/${fileId}/`;
  const index = path.lastIndexOf(marker);
  if (index <= 0) {
    throw new Error('Mounted file route scope is invalid.');
  }
  return path.slice(0, index);
}

export function createScopedCapabilityScope(
  routeIdentity: string,
  context: Context,
): string {
  return `${routeIdentity}:${readScopedRoutePath(context)}`;
}
