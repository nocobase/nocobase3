import type { Hono } from 'hono';

import { normalizeBasePath } from '../support/paths.js';
import { proxyRequest } from './http-proxy.js';

export interface NocoBaseApiProxyOptions {
  apiProxyPath: string;
  nocoBaseApiUrl: URL | undefined;
}

export function resolveNocoBaseApiUrl(value: string | false | undefined): URL | undefined {
  if (value === false) {
    return undefined;
  }

  const normalized = value?.trim();
  if (!normalized || normalized === 'false' || normalized === '0') {
    return undefined;
  }

  return new URL(normalized);
}

export function registerNocoBaseApiProxyRoutes(app: Hono, options: NocoBaseApiProxyOptions): void {
  const apiProxyPath = normalizeBasePath(options.apiProxyPath);
  if (!apiProxyPath) {
    return;
  }

  const proxyOptions = {
    ...options,
    apiProxyPath,
  };

  app.all(apiProxyPath, (context) => proxyToNocoBaseApi(context.req.raw, proxyOptions));
  app.all(`${apiProxyPath}/*`, (context) => proxyToNocoBaseApi(context.req.raw, proxyOptions));
}

export async function proxyToNocoBaseApi(request: Request, options: NocoBaseApiProxyOptions): Promise<Response> {
  if (!options.nocoBaseApiUrl) {
    return Response.json(
      {
        error: 'NocoBase API proxy target is not configured.',
      },
      {
        status: 503,
      },
    );
  }

  const targetUrl = createNocoBaseApiTargetUrl(request, options.apiProxyPath, options.nocoBaseApiUrl);

  return proxyRequest(request, targetUrl, {
    headers: createNocoBaseApiProxyHeaders(request, options.apiProxyPath, options.nocoBaseApiUrl),
    unavailableMessage: 'NocoBase API server is unavailable.',
  });
}

export function createNocoBaseApiTargetUrl(request: Request, apiProxyPath: string, nocoBaseApiUrl: URL): URL {
  const requestUrl = new URL(request.url);
  const normalizedProxyPath = normalizeBasePath(apiProxyPath).replace(/\/$/, '');
  const apiBasePath = nocoBaseApiUrl.pathname.replace(/\/$/, '');
  const suffix = requestUrl.pathname.slice(normalizedProxyPath.length).replace(/^\/+/, '');
  const pathname = suffix ? `${apiBasePath}/${suffix}` : apiBasePath || '/';
  const targetUrl = new URL(nocoBaseApiUrl);
  targetUrl.pathname = pathname;
  targetUrl.search = requestUrl.search;
  return targetUrl;
}

export function createNocoBaseApiProxyHeaders(
  request: Request,
  apiProxyPath: string,
  nocoBaseApiUrl: URL,
): Headers {
  const headers = new Headers(request.headers);
  const sourceUrl = new URL(request.url);

  if (isCrossSiteUpstream(nocoBaseApiUrl)) {
    headers.set('x-forwarded-host', nocoBaseApiUrl.host);
    headers.set('x-forwarded-proto', nocoBaseApiUrl.protocol.replace(/:$/, ''));

    if (headers.has('origin')) {
      headers.set('origin', nocoBaseApiUrl.origin);
    }

    if (headers.has('referer')) {
      headers.set('referer', `${nocoBaseApiUrl.origin}/`);
    }
  } else {
    if (!headers.has('x-forwarded-host')) {
      headers.set('x-forwarded-host', headers.get('host') ?? sourceUrl.host);
    }

    if (!headers.has('x-forwarded-proto')) {
      headers.set('x-forwarded-proto', sourceUrl.protocol.replace(/:$/, ''));
    }
  }

  headers.set('x-forwarded-prefix', normalizeBasePath(apiProxyPath));

  return headers;
}

function isCrossSiteUpstream(nocoBaseApiUrl: URL): boolean {
  return !/^(127\.0\.0\.1|localhost|\[::1\]|::1)$/i.test(nocoBaseApiUrl.hostname);
}
