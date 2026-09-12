/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export function addBasePathToRedirectResponse(
  response: Response,
  basePath: string,
): Response {
  if (![301, 302, 303, 307, 308].includes(response.status)) {
    return response;
  }

  const location = response.headers.get('location');
  if (
    !location ||
    !location.startsWith('/') ||
    location.startsWith('//') ||
    location === basePath ||
    location.startsWith(`${basePath}/`)
  ) {
    return response;
  }

  const publicLocation =
    location === '/' ? `${basePath}/` : `${basePath}${location}`;
  const headers = new Headers(response.headers);
  headers.set('location', publicLocation);
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

const ROOT_RELATIVE_ASSET_ATTRIBUTE =
  /(\b(?:src|href|content)\s*=\s*["'])\/(?!\/)(?:[^"'<>?#]*\/)?assets\//gi;

export async function addBasePathToHtmlResponse(
  response: Response,
  basePath: string,
): Promise<Response> {
  const contentType = response.headers.get('content-type');
  if (
    !contentType?.toLowerCase().startsWith('text/html') ||
    response.body === null
  ) {
    return response;
  }

  const html = await response.text();
  const normalizedBasePath =
    basePath === '/' ? '' : `/${basePath.replace(/^\/+|\/+$/g, '')}`;
  const rewrittenHtml = html.replace(
    ROOT_RELATIVE_ASSET_ATTRIBUTE,
    `$1${normalizedBasePath}/assets/`,
  );

  if (rewrittenHtml === html) {
    return new Response(html, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');

  return new Response(rewrittenHtml, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}
