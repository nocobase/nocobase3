import { proxyRequest } from './http-proxy.js';

export interface OriginProxyOptions {
  targetOrigin: URL;
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
  const headers = alignRequestOrigin(
    new Headers(request.headers),
    requestUrl.origin,
    options.targetOrigin,
  );

  return proxyRequest(request, targetUrl, {
    headers,
    unavailableMessage:
      options.unavailableMessage ?? 'Upstream server is unavailable.',
  });
}

function alignRequestOrigin(
  headers: Headers,
  requestOrigin: string,
  targetOrigin: URL,
): Headers {
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

  return headers;
}
