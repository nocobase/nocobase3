import { joinBasePath, normalizeBasePath } from './paths.js';

export function addBasePathToRedirectResponse(
  response: Response,
  basePath: string,
): Response {
  if (!isRedirectStatus(response.status)) {
    return response;
  }

  const location = response.headers.get('Location');
  if (!location) {
    return response;
  }

  const publicLocation = addBasePathToLocation(location, basePath);
  if (publicLocation === location) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set('Location', publicLocation);
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export function addBasePathToLocation(
  location: string,
  basePath: string,
): string {
  const normalizedBasePath = normalizeBasePath(basePath);
  if (
    !normalizedBasePath ||
    !location.startsWith('/') ||
    location.startsWith('//')
  ) {
    return location;
  }

  const suffixIndex = location.search(/[?#]/);
  const pathname =
    suffixIndex === -1 ? location : location.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? '' : location.slice(suffixIndex);

  if (
    pathname === normalizedBasePath ||
    pathname.startsWith(`${normalizedBasePath}/`)
  ) {
    return location;
  }

  const publicPath =
    pathname === '/'
      ? `${normalizedBasePath}/`
      : joinBasePath(normalizedBasePath, pathname);
  return `${publicPath}${suffix}`;
}

function isRedirectStatus(status: number): boolean {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}
