import { Hono } from 'hono';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

export interface CreateAppOptions {
  appName?: string;
  basePath?: string;
  browserBasePath?: string;
  browserApiUrl?: string;
  apiProxyPath?: string;
  clientHandler?: ClientHandler;
  clientIndexPath?: string;
  nocoBaseApiUrl?: string | false;
  apiClientStoragePrefix?: string;
  apiClientStorageType?: string;
  apiClientShareToken?: boolean;
}

export type ClientHandler = (request: Request) => Response | Promise<Response>;

export function createApp(options: CreateAppOptions = {}): Hono {
  const appName = resolveAppName(options.appName);
  const basePath = resolveBasePath(options.basePath, appName);
  const browserBasePath = resolveBrowserBasePath(options.browserBasePath, basePath);
  const apiProxyPath = resolveApiProxyPath(options.apiProxyPath, basePath);
  const browserApiUrl = options.browserApiUrl ?? joinBasePath(browserBasePath, '/v2/api');
  const nocoBaseApiUrl = resolveNocoBaseApiUrl(options.nocoBaseApiUrl);
  const clientHandler = options.clientHandler;
  const clientIndexPath = options.clientIndexPath ?? path.resolve(process.cwd(), 'index.html');
  const clientRootDir = path.dirname(clientIndexPath);
  const app = new Hono();

  app.get('/healthz', (context) => {
    return context.json({
      ok: true,
      app: {
        name: appName,
        basePath: browserBasePath,
      },
    });
  });

  if (apiProxyPath) {
    app.all(apiProxyPath, (context) => proxyToNocoBaseApi(context.req.raw, apiProxyPath, nocoBaseApiUrl));
    app.all(`${apiProxyPath}/*`, (context) => proxyToNocoBaseApi(context.req.raw, apiProxyPath, nocoBaseApiUrl));
  }

  const api = new Hono();

  api.get('/healthz', (context) => {
    return context.json({
      ok: true,
      app: {
        name: appName,
        basePath: browserBasePath,
      },
      basePath: browserBasePath,
    });
  });

  api.get('/apps', (context) => {
    return context.json({
      apps: [],
    });
  });

  app.route(`${basePath}/api`, api);
  if (clientHandler) {
    app.all(basePath || '/', (context) => clientHandler(context.req.raw));
    app.all(`${basePath}/*`, (context) => clientHandler(context.req.raw));
  } else {
    app.all(`${basePath}/assets`, (context) => serveClientAsset(context.req.raw, clientRootDir, basePath));
    app.all(`${basePath}/assets/*`, (context) => serveClientAsset(context.req.raw, clientRootDir, basePath));
    app.get(basePath || '/', () =>
      serveClient(clientIndexPath, {
        appBasePath: browserBasePath,
        apiUrl: browserApiUrl,
        storagePrefix: options.apiClientStoragePrefix,
        storageType: options.apiClientStorageType,
        shareToken: options.apiClientShareToken,
      }),
    );
    app.get(`${basePath}/*`, () =>
      serveClient(clientIndexPath, {
        appBasePath: browserBasePath,
        apiUrl: browserApiUrl,
        storagePrefix: options.apiClientStoragePrefix,
        storageType: options.apiClientStorageType,
        shareToken: options.apiClientShareToken,
      }),
    );
  }

  return app;
}

function resolveAppName(value: string | undefined): string {
  const normalized = value?.trim() || 'app';
  return normalized.replace(/^\/+|\/+$/g, '') || 'app';
}

function resolveBasePath(value: string | undefined, appName: string): string {
  return normalizeBasePath(value ?? `/${appName}`);
}

function resolveBrowserBasePath(value: string | undefined, basePath: string): string {
  return normalizeBasePath(value ?? basePath);
}

function resolveApiProxyPath(value: string | undefined, basePath: string): string {
  if (!value) {
    return joinBasePath(basePath, '/v2/api');
  }

  try {
    const url = new URL(value);
    return normalizeBasePath(url.pathname);
  } catch {
    return normalizeBasePath(value);
  }
}

export function normalizeBasePath(value: string): string {
  const normalized = value.trim().replace(/^\/+|\/+$/g, '');
  return normalized ? `/${normalized}` : '';
}

export function joinBasePath(basePath: string, pathInsideBase: string): string {
  const normalizedBasePath = normalizeBasePath(basePath);
  const normalizedPath = normalizeBasePath(pathInsideBase);
  return `${normalizedBasePath}${normalizedPath}` || '/';
}

function resolveNocoBaseApiUrl(value: string | false | undefined): URL | undefined {
  if (value === false) {
    return undefined;
  }

  const raw = value;
  const normalized = raw?.trim();
  if (!normalized || normalized === 'false' || normalized === '0') {
    return undefined;
  }

  return new URL(normalized);
}

async function proxyToNocoBaseApi(
  request: Request,
  apiProxyPath: string,
  nocoBaseApiUrl: URL | undefined,
): Promise<Response> {
  if (!nocoBaseApiUrl) {
    return Response.json(
      {
        error: 'NocoBase API proxy target is not configured.',
      },
      {
        status: 503,
      },
    );
  }

  const targetUrl = createApiTargetUrl(request, apiProxyPath, nocoBaseApiUrl);

  return proxyRequest(request, targetUrl, {
    headers: createNocoBaseApiProxyHeaders(request, apiProxyPath),
    unavailableMessage: 'NocoBase API server is unavailable.',
  });
}

function createApiTargetUrl(request: Request, apiProxyPath: string, nocoBaseApiUrl: URL): URL {
  const requestUrl = new URL(request.url);
  const normalizedProxyPath = apiProxyPath.replace(/\/$/, '');
  const apiBasePath = nocoBaseApiUrl.pathname.replace(/\/$/, '');
  const suffix = requestUrl.pathname.slice(normalizedProxyPath.length).replace(/^\/+/, '');
  const pathname = suffix ? `${apiBasePath}/${suffix}` : apiBasePath || '/';
  const targetUrl = new URL(nocoBaseApiUrl);
  targetUrl.pathname = pathname;
  targetUrl.search = requestUrl.search;
  return targetUrl;
}

async function proxyRequest(
  request: Request,
  targetUrl: URL,
  {
    headers = new Headers(request.headers),
    unavailableMessage,
  }: {
    headers?: Headers;
    unavailableMessage: string;
  },
): Promise<Response> {
  headers.set('host', targetUrl.host);
  headers.set('accept-encoding', 'identity');
  removeHopByHopHeaders(headers);

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: createProxyResponseHeaders(response.headers),
    });
  } catch (error) {
    return Response.json(
      {
        error: unavailableMessage,
        target: targetUrl.origin,
        message: error instanceof Error ? error.message : String(error),
      },
      {
        status: 502,
      },
    );
  }
}

function createProxyResponseHeaders(headers: Headers): Headers {
  const nextHeaders = new Headers(headers);
  removeHopByHopHeaders(nextHeaders);
  nextHeaders.delete('content-encoding');
  nextHeaders.delete('content-length');
  return nextHeaders;
}

function removeHopByHopHeaders(headers: Headers): void {
  for (const header of [
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
  ]) {
    headers.delete(header);
  }
}

/**
 * Build the headers forwarded to the upstream NocoBase API.
 *
 * The guiding rule: **relay the browser's hop faithfully; do not replace it with this process's own
 * hop to the upstream.** That distinction is what separates a reverse proxy from a client. The
 * upstream reconstructs "which address is the user actually looking at" from these headers, and that
 * address is the site's public origin -- not 127.0.0.1:13000.
 *
 * Sign-in is where this bites. `auth:signIn` validates the request's origin
 * (`assertTrustedSignInOrigin` in core/auth): the `origin` header must equal, verbatim, the
 * requestOrigin the upstream derives as `x-forwarded-proto || protocol` + `x-forwarded-host || host`
 * (core/utils' cors.ts). So all three of the following must point at the site itself; getting any one
 * of them wrong yields `403 Invalid sign-in origin`:
 *
 *   - `origin`            -- forwarded untouched
 *   - `x-forwarded-host`  -- the host the browser addressed
 *   - `x-forwarded-proto` -- the protocol the browser used
 *
 * **Local development cannot reproduce a failure here, so do not validate this against it.** When the
 * proxy target is the public site, the request traverses the site's own reverse proxy on the way out,
 * which overwrites whatever `x-forwarded-*` this function got wrong; meanwhile a rewritten `origin`
 * happens to equal the site's origin anyway. The two errors cancel and everything looks green. Only a
 * deployment that proxies straight to the upstream (no intermediary to correct the headers) exposes
 * it -- which is why this behaviour is pinned by tests rather than by manual checks.
 */
function createNocoBaseApiProxyHeaders(request: Request, apiProxyPath: string): Headers {
  const headers = new Headers(request.headers);
  const sourceUrl = new URL(request.url);

  // This process may itself sit behind a reverse proxy that terminates TLS and connects onward in
  // cleartext. In that case these two headers already carry the browser's real hop and must be left
  // alone -- overwriting them with this connection's details reports an https site as http, which
  // fails the sign-in origin check. Only fill them in when nothing upstream has.
  //
  // Note the protocol cannot come from `request.url`: the scheme there is derived from whether this
  // socket is encrypted, and behind a TLS-terminating proxy that is always plain http.
  if (!headers.has('x-forwarded-host')) {
    headers.set('x-forwarded-host', headers.get('host') ?? sourceUrl.host);
  }

  if (!headers.has('x-forwarded-proto')) {
    headers.set('x-forwarded-proto', sourceUrl.protocol.replace(/:$/, ''));
  }

  headers.set('x-forwarded-prefix', apiProxyPath);

  // `origin` and `referer` are forwarded as-is, deliberately.

  return headers;
}

interface ClientRuntimeConfig {
  appBasePath: string;
  apiUrl: string;
  storagePrefix?: string;
  storageType?: string;
  shareToken?: boolean;
}

const oneYearSeconds = 31_536_000;
const runtimeConfigStartMarker = '<!-- nocobase-runtime-config:start -->';
const runtimeConfigEndMarker = '<!-- nocobase-runtime-config:end -->';
const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function serveClientAsset(request: Request, clientRootDir: string, basePath: string): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return methodNotAllowed('GET, HEAD');
  }

  const requestUrl = new URL(request.url);
  const pathInsideClient = getPathInsideClient(requestUrl.pathname, basePath);
  const response = await serveFileIfExists(clientRootDir, pathInsideClient, request.method, {
    cacheControl: `public, max-age=${oneYearSeconds}, immutable`,
  });

  return response ?? notFound();
}

async function serveClient(clientIndexPath: string, runtimeConfig: ClientRuntimeConfig): Promise<Response> {
  const html = await readFile(clientIndexPath, 'utf8');
  return new Response(injectRuntimeConfig(html, runtimeConfig), {
    headers: {
      'cache-control': 'no-cache',
      'content-type': 'text/html; charset=utf-8',
    },
  });
}

function injectRuntimeConfig(html: string, runtimeConfig: ClientRuntimeConfig): string {
  const cleanHtml = stripExistingRuntimeConfig(html);
  const moduleScriptPattern = /<script\s+[^>]*type=["']module["'][^>]*>/i;
  const moduleScriptMatch = cleanHtml.match(moduleScriptPattern);
  const configHtml = createRuntimeConfigHtml(runtimeConfig);

  if (moduleScriptMatch?.index === undefined) {
    return `${cleanHtml}\n${configHtml}`;
  }

  return `${cleanHtml.slice(0, moduleScriptMatch.index)}${configHtml}${cleanHtml.slice(moduleScriptMatch.index)}`;
}

function stripExistingRuntimeConfig(html: string): string {
  const pattern = new RegExp(`${runtimeConfigStartMarker}[\\s\\S]*?${runtimeConfigEndMarker}\\s*`, 'g');
  return html.replace(pattern, '');
}

function createRuntimeConfigHtml({ appBasePath, apiUrl, storagePrefix, storageType, shareToken }: ClientRuntimeConfig): string {
  const normalizedStoragePrefix = storagePrefix?.trim() || 'NOCOBASE_';
  const normalizedStorageType = storageType?.trim() || 'localStorage';
  const normalizedShareToken = shareToken ?? false;

  return `${runtimeConfigStartMarker}
<script>
  window.NOCOBASE_PORTAL_BASE = ${JSON.stringify(toBrowserBasePath(appBasePath))};
  window.NOCOBASE_API_URL = ${JSON.stringify(apiUrl)};
  window.__nocobase_api_client_storage_prefix__ = ${JSON.stringify(normalizedStoragePrefix)};
  window.__nocobase_api_client_storage_type__ = ${JSON.stringify(normalizedStorageType)};
  window.__nocobase_api_client_share_token__ = ${JSON.stringify(normalizedShareToken)};
</script>
${runtimeConfigEndMarker}
`;
}

function toBrowserBasePath(value: string): string {
  return value ? `${value.replace(/\/+$/, '')}/` : '/';
}

async function serveFileIfExists(
  rootDir: string,
  requestPath: string,
  method: string,
  options: { cacheControl?: string } = {},
): Promise<Response | null> {
  const filePath = resolveClientFile(rootDir, requestPath);
  if (!filePath) {
    return null;
  }

  let stats: Awaited<ReturnType<typeof stat>>;
  try {
    stats = await stat(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return null;
    }

    throw error;
  }

  if (!stats.isFile()) {
    return null;
  }

  const headers = new Headers({
    'cache-control': options.cacheControl ?? 'no-cache',
    'content-length': String(stats.size),
    'content-type': contentTypeFor(filePath),
    'last-modified': stats.mtime.toUTCString(),
  });

  const body =
    method === 'HEAD'
      ? null
      : (Readable.toWeb(createReadStream(filePath)) as ConstructorParameters<typeof Response>[0]);
  return new Response(body, { headers });
}

function getPathInsideClient(pathname: string, basePath: string): string {
  const pathInside = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) : pathname;
  return pathInside.startsWith('/') ? pathInside : `/${pathInside}`;
}

function resolveClientFile(rootDir: string, requestPath: string): string | null {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  if (decodedPath.includes('\0')) {
    return null;
  }

  const normalizedPath = decodedPath.replace(/^\/+/, '');
  const filePath = path.resolve(rootDir, normalizedPath);
  const relative = path.relative(rootDir, filePath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  return filePath;
}

function contentTypeFor(filePath: string): string {
  return contentTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function methodNotAllowed(allow: string): Response {
  return Response.json(
    {
      error: 'Method not allowed',
    },
    {
      status: 405,
      headers: {
        allow,
      },
    },
  );
}

function notFound(): Response {
  return Response.json(
    {
      error: 'Not found',
    },
    {
      status: 404,
    },
  );
}
