import { addBasePathToRedirectResponse } from '../support/redirects.js';
import { normalizeBasePath } from '../support/paths.js';
import { cloneRequestWithUrl } from '../support/requests.js';
import type { AppServer } from './types.js';

export function createPublicBasePathAdapter(
  app: AppServer,
  publicBasePath: string,
): AppServer {
  const basePath = normalizeBasePath(publicBasePath);
  if (!basePath) {
    return app;
  }

  const mounted: AppServer = {
    fetch: (request, env, executionContext) =>
      dispatchMountedApp(app, request, basePath, env, executionContext),
  };
  if (app.websocket) {
    mounted.websocket = (request, env) => {
      const strippedRequest = stripPublicBasePathFromRequest(request, basePath);
      if (!strippedRequest) {
        return null;
      }

      return app.websocket?.(strippedRequest, env) ?? null;
    };
  }

  return mounted;
}

export function stripPublicBasePathFromRequest(
  request: Request,
  publicBasePath: string,
): Request | null {
  const basePath = normalizeBasePath(publicBasePath);
  if (!basePath) {
    return request;
  }

  const url = new URL(request.url);
  if (url.pathname === basePath || url.pathname === `${basePath}/`) {
    url.pathname = '/';
    return cloneRequestWithUrl(request, url);
  }

  if (!url.pathname.startsWith(`${basePath}/`)) {
    return null;
  }

  url.pathname = url.pathname.slice(basePath.length) || '/';
  return cloneRequestWithUrl(request, url);
}

async function dispatchMountedApp(
  app: AppServer,
  request: Request,
  publicBasePath: string,
  env?: unknown,
  executionContext?: Parameters<AppServer['fetch']>[2],
): Promise<Response> {
  const strippedRequest = stripPublicBasePathFromRequest(
    request,
    publicBasePath,
  );
  if (!strippedRequest) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const response = await app.fetch(strippedRequest, env, executionContext);
  return addBasePathToRedirectResponse(response, publicBasePath);
}
