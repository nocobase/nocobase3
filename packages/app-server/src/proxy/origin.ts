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

export function proxyToOrigin(request: Request, options: OriginProxyOptions): Promise<Response> {
  const requestUrl = new URL(request.url);
  const targetUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, options.targetOrigin);

  return proxyRequest(request, targetUrl, {
    unavailableMessage: options.unavailableMessage ?? 'Upstream server is unavailable.',
  });
}
