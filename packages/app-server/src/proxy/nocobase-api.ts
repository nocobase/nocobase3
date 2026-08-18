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
    headers: createNocoBaseApiProxyHeaders(request, targetUrl, options.nocoBaseApiUrl, options.apiProxyPath),
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
  targetUrl: URL,
  nocoBaseApiUrl: URL,
  apiProxyPath: string,
): Headers {
  const headers = new Headers(request.headers);
  const sourceUrl = new URL(request.url);
  const sourceProtocol = sourceUrl.protocol.replace(/:$/, '');
  const originalHost = headers.get('host') ?? sourceUrl.host;
  const upstreamServerBaseUrl = getNocoBaseServerBaseUrl(nocoBaseApiUrl);

  headers.set('x-forwarded-host', originalHost);
  headers.set('x-forwarded-proto', sourceProtocol);
  headers.set('x-forwarded-prefix', normalizeBasePath(apiProxyPath));

  if (headers.has('origin')) {
    headers.set('origin', targetUrl.origin);
  }

  if (headers.has('referer')) {
    headers.set('referer', rewriteReferer(headers.get('referer'), upstreamServerBaseUrl));
  }

  return headers;
}

function getNocoBaseServerBaseUrl(nocoBaseApiUrl: URL): URL {
  const serverBaseUrl = new URL(nocoBaseApiUrl);
  const apiIndex = serverBaseUrl.pathname.match(/\/api(?:\/|$)/)?.index;
  serverBaseUrl.pathname = apiIndex === undefined ? '/' : serverBaseUrl.pathname.slice(0, apiIndex + 1);
  serverBaseUrl.search = '';
  serverBaseUrl.hash = '';
  return serverBaseUrl;
}

function rewriteReferer(value: string | null, upstreamServerBaseUrl: URL): string {
  if (!value) {
    return upstreamServerBaseUrl.toString();
  }

  try {
    const refererUrl = new URL(value);
    return new URL(refererUrl.pathname.replace(/^\/+/, ''), upstreamServerBaseUrl).toString();
  } catch {
    return upstreamServerBaseUrl.toString();
  }
}
