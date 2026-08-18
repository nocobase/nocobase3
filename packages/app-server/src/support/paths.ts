export function resolveAppName(value: string | undefined): string {
  const normalized = value?.trim() || 'app';
  return normalized.replace(/^\/+|\/+$/g, '') || 'app';
}

export function resolveAppNameFromBasePath(value: string | undefined, fallback = 'app'): string {
  const segments = normalizeBasePath(value ?? '').split('/').filter(Boolean);
  return resolveAppName(segments.at(-1) ?? fallback);
}

export function resolveApiProxyPath(value: string | undefined, basePath: string): string {
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
