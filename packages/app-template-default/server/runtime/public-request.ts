import {
  joinBasePath,
  normalizeBasePath,
} from '@nocobase/app-server-kit/support';

interface RequestInitWithDuplex extends RequestInit {
  duplex?: 'half';
}

/** Resolves an app-local pathname to the path exposed by the app runtime. */
export function resolvePublicPath(
  appLocalPath: string,
  publicBasePath: string,
): string {
  const basePath = normalizeBasePath(publicBasePath);
  const localPath = normalizeBasePath(appLocalPath);

  if (!basePath) {
    return localPath || '/';
  }

  return localPath ? joinBasePath(basePath, localPath) : `${basePath}/`;
}

/** Restores the public mount path on an app-local request. */
export function toPublicRequest(
  request: Request,
  publicBasePath: string,
): Request {
  if (!normalizeBasePath(publicBasePath)) {
    return request;
  }

  const url = new URL(request.url);
  url.pathname = resolvePublicPath(url.pathname, publicBasePath);

  const init: RequestInitWithDuplex = {
    method: request.method,
    headers: request.headers,
    signal: request.signal,
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }

  return new Request(url, init);
}
