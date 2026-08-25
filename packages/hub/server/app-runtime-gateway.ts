import type { Context, Hono, Next } from 'hono';

import { proxyRequest } from '@nocobase/app-server/proxy';

export interface AppRuntimeGatewayOptions {
  targetUrl: string | URL;
  reservedAppIds?: Iterable<string>;
}

interface ResolvedAppRuntimeGatewayOptions {
  targetUrl: URL;
  reservedAppIds: ReadonlySet<string>;
}

export function registerAppRuntimeGatewayRoutes(
  app: Hono,
  options: AppRuntimeGatewayOptions,
): void {
  const resolved = resolveOptions(options);
  const handler = (context: Context, next: Next): Promise<Response | void> => {
    const appId = context.req.param('appId');
    if (!appId || !isSafeAppId(appId) || resolved.reservedAppIds.has(appId)) {
      return next();
    }

    return proxyAppRuntimeRequest(context.req.raw, appId, resolved.targetUrl);
  };

  app.all('/:appId', handler);
  app.all('/:appId/*', handler);
}

export async function proxyAppRuntimeRequest(
  request: Request,
  appId: string,
  targetUrl: URL,
): Promise<Response> {
  if (!isSafeAppId(appId)) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const requestUrl = new URL(request.url);
  const upstreamUrl = new URL(targetUrl);
  upstreamUrl.pathname = requestUrl.pathname;
  upstreamUrl.search = requestUrl.search;
  upstreamUrl.hash = '';

  const response = await proxyRequest(request, upstreamUrl, {
    headers: createAppRuntimeGatewayHeaders(request, appId),
    unavailableMessage: `App ${appId} is unavailable.`,
  });

  return rewriteAppRuntimeGatewayResponse(response, upstreamUrl, appId);
}

export function createAppRuntimeGatewayHeaders(
  request: Request,
  appId: string,
): Headers {
  const headers = new Headers(request.headers);
  const sourceUrl = new URL(request.url);

  if (!headers.has('x-forwarded-host')) {
    headers.set('x-forwarded-host', headers.get('host') ?? sourceUrl.host);
  }
  if (!headers.has('x-forwarded-proto')) {
    headers.set('x-forwarded-proto', sourceUrl.protocol.replace(/:$/, ''));
  }
  headers.set('x-forwarded-prefix', `/${appId}`);

  return headers;
}

function rewriteAppRuntimeGatewayResponse(
  response: Response,
  upstreamUrl: URL,
  appId: string,
): Response {
  const location = response.headers.get('location');
  if (!location) {
    return response;
  }

  let resolvedLocation: URL;
  try {
    resolvedLocation = new URL(location, upstreamUrl);
  } catch {
    return response;
  }
  if (resolvedLocation.origin !== upstreamUrl.origin) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set('location', toGatewayLocation(resolvedLocation, appId));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function toGatewayLocation(location: URL, appId: string): string {
  const appPath = `/${appId}`;
  const pathname = location.pathname.startsWith(appPath)
    ? location.pathname
    : `${appPath}${location.pathname.startsWith('/') ? location.pathname : `/${location.pathname}`}`;
  return `${pathname}${location.search}${location.hash}`;
}

function resolveOptions(
  options: AppRuntimeGatewayOptions,
): ResolvedAppRuntimeGatewayOptions {
  const targetUrl = new URL(options.targetUrl);
  if (
    (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') ||
    targetUrl.username ||
    targetUrl.password
  ) {
    throw new Error(
      'App runtime gateway target must use HTTP(S) without embedded credentials.',
    );
  }

  targetUrl.pathname = '/';
  targetUrl.search = '';
  targetUrl.hash = '';
  return {
    targetUrl,
    reservedAppIds: new Set(options.reservedAppIds ?? []),
  };
}

function isSafeAppId(value: string): boolean {
  return (
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value) &&
    value !== '.' &&
    value !== '..'
  );
}
