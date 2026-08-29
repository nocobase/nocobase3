import { proxyRequest } from './http-proxy.js';
import { joinBasePath, normalizeBasePath } from '../support/paths.js';
import { cloneRequestWithUrl } from '../support/requests.js';

export interface OriginProxyOptions {
  targetOrigin: URL;
  unavailableMessage?: string;
}

export interface MountedOriginProxyOptions {
  publicBasePath: string;
  unavailableMessage?: string;
}

export function createOriginProxyHandler(
  targetOrigin: URL,
  options: Omit<OriginProxyOptions, 'targetOrigin'> = {},
): (request: Request) => Promise<Response> {
  return (request) =>
    proxyToOrigin(request, {
      ...options,
      targetOrigin,
    });
}

export function proxyToOrigin(
  request: Request,
  options: OriginProxyOptions,
): Promise<Response> {
  const requestUrl = new URL(request.url);
  const targetUrl = new URL(
    `${requestUrl.pathname}${requestUrl.search}`,
    options.targetOrigin,
  );

  return proxyRequest(request, targetUrl, {
    unavailableMessage:
      options.unavailableMessage ?? 'Upstream server is unavailable.',
  });
}

export function createMountedOriginProxyHandler(
  targetOrigin: URL,
  options: MountedOriginProxyOptions,
): (request: Request) => Promise<Response> {
  const proxyToOrigin = createOriginProxyHandler(targetOrigin, {
    unavailableMessage: options.unavailableMessage,
  });

  return (request) =>
    proxyToOrigin(
      alignRequestOrigin(
        addPublicBasePathToRequest(request, options.publicBasePath),
        targetOrigin,
      ),
    );
}

function alignRequestOrigin(request: Request, targetOrigin: URL): Request {
  const headers = new Headers(request.headers);
  const requestOrigin = new URL(request.url).origin;
  for (const name of ['origin', 'referer']) {
    const value = headers.get(name);
    if (!value) continue;

    try {
      const url = new URL(value);
      if (url.origin !== requestOrigin) continue;
      url.protocol = targetOrigin.protocol;
      url.host = targetOrigin.host;
      headers.set(name, name === 'origin' ? url.origin : url.toString());
    } catch {
      // Preserve malformed browser headers so the upstream can reject them.
    }
  }

  return cloneRequestWithUrl(request, new URL(request.url), headers);
}

function addPublicBasePathToRequest(
  request: Request,
  publicBasePath: string,
): Request {
  const basePath = normalizeBasePath(publicBasePath);
  if (!basePath) {
    return request;
  }

  const url = new URL(request.url);
  url.pathname = joinPublicPath(basePath, url.pathname);
  return cloneRequestWithUrl(request, url);
}

function joinPublicPath(publicBasePath: string, appLocalPath: string): string {
  const basePath = normalizeBasePath(publicBasePath);
  const localPath = normalizeBasePath(appLocalPath);

  if (!basePath) {
    return localPath || '/';
  }

  return localPath ? joinBasePath(basePath, localPath) : `${basePath}/`;
}
