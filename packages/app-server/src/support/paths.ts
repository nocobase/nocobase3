export function resolveAppName(value: string | undefined): string {
  const normalized = value?.trim() || 'app';
  return normalized.replace(/^\/+|\/+$/g, '') || 'app';
}

export function resolveAppNameFromBasePath(
  value: string | undefined,
  fallback = 'app',
): string {
  const segments = normalizeBasePath(value ?? '')
    .split('/')
    .filter(Boolean);
  return resolveAppName(segments.at(-1) ?? fallback);
}

export function resolveApiProxyPath(
  value: string | undefined,
  basePath: string,
): string {
  if (!value) {
    return joinBasePath(basePath, '/v2/api');
  }

  try {
    const url = new URL(value);
    return normalizeBasePath(url.pathname);
  } catch {
    return normalizeBasePath(value);
  }
}

export function normalizeBasePath(value: string): string {
  const normalized = value.trim().replace(/^\/+|\/+$/g, '');
  return normalized ? `/${normalized}` : '';
}

export function joinBasePath(basePath: string, pathInsideBase: string): string {
  const normalizedBasePath = normalizeBasePath(basePath);
  const normalizedPath = normalizeBasePath(pathInsideBase);
  return `${normalizedBasePath}${normalizedPath}` || '/';
}

export function resolvePublicAppUrl(
  publicUrl: string | undefined,
  appBasePath: string,
): string | undefined {
  if (!publicUrl?.trim()) return undefined;

  const url = new URL(publicUrl);
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password
  ) {
    throw new Error(
      'Public App URL must use HTTP(S) without embedded credentials.',
    );
  }

  url.pathname = joinBasePath(url.pathname, appBasePath);
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

/**
 * Resolve the browser origin used by an App's internal authentication handler.
 * App Host strips the public App path before dispatching the request, so the
 * authentication library must receive the public origin without a path.
 */
export function resolvePublicAuthBaseUrl(
  publicUrl: string | undefined,
): string | undefined {
  if (!publicUrl?.trim()) return undefined;

  const url = new URL(publicUrl);
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password
  ) {
    throw new Error(
      'Public App URL must use HTTP(S) without embedded credentials.',
    );
  }

  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}
