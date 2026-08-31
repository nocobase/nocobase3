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
  clientHandler?: ClientHandler;
  clientIndexPath?: string;
  apiClientStoragePrefix?: string;
  apiClientStorageType?: string;
  apiClientShareToken?: boolean;
}

export type ClientHandler = (request: Request) => Response | Promise<Response>;

export function createApp(options: CreateAppOptions = {}): Hono {
  const appName = resolveAppName(options.appName);
  const basePath = resolveBasePath(options.basePath, appName);
  const browserBasePath = resolveBrowserBasePath(
    options.browserBasePath,
    basePath,
  );
  const browserApiUrl =
    options.browserApiUrl ?? joinBasePath(browserBasePath, '/api');
  const clientHandler = options.clientHandler;
  const clientIndexPath =
    options.clientIndexPath ?? path.resolve(process.cwd(), 'index.html');
  const clientRootDir = path.dirname(clientIndexPath);
  const router = new Hono();

  router.get('/healthz', (context) => {
    return context.json({
      ok: true,
      app: {
        name: appName,
        basePath: browserBasePath,
      },
    });
  });

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

  router.route(`${basePath}/api`, api);
  if (clientHandler) {
    router.all(basePath || '/', (context) => clientHandler(context.req.raw));
    router.all(`${basePath}/*`, (context) => clientHandler(context.req.raw));
  } else {
    router.all(`${basePath}/assets`, (context) =>
      serveClientAsset(context.req.raw, clientRootDir, basePath),
    );
    router.all(`${basePath}/assets/*`, (context) =>
      serveClientAsset(context.req.raw, clientRootDir, basePath),
    );
    router.get(basePath || '/', () =>
      serveClient(clientIndexPath, {
        appBasePath: browserBasePath,
        apiUrl: browserApiUrl,
        storagePrefix: options.apiClientStoragePrefix,
        storageType: options.apiClientStorageType,
        shareToken: options.apiClientShareToken,
      }),
    );
    router.get(`${basePath}/*`, () =>
      serveClient(clientIndexPath, {
        appBasePath: browserBasePath,
        apiUrl: browserApiUrl,
        storagePrefix: options.apiClientStoragePrefix,
        storageType: options.apiClientStorageType,
        shareToken: options.apiClientShareToken,
      }),
    );
  }

  return router;
}

function resolveAppName(value: string | undefined): string {
  const normalized = value?.trim() || 'app';
  return normalized.replace(/^\/+|\/+$/g, '') || 'app';
}

function resolveBasePath(value: string | undefined, appName: string): string {
  return normalizeBasePath(value ?? `/${appName}`);
}

function resolveBrowserBasePath(
  value: string | undefined,
  basePath: string,
): string {
  return normalizeBasePath(value ?? basePath);
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

async function serveClientAsset(
  request: Request,
  clientRootDir: string,
  basePath: string,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return methodNotAllowed('GET, HEAD');
  }

  const requestUrl = new URL(request.url);
  const pathInsideClient = getPathInsideClient(requestUrl.pathname, basePath);
  const response = await serveFileIfExists(
    clientRootDir,
    pathInsideClient,
    request.method,
    {
      cacheControl: `public, max-age=${oneYearSeconds}, immutable`,
    },
  );

  return response ?? notFound();
}

async function serveClient(
  clientIndexPath: string,
  runtimeConfig: ClientRuntimeConfig,
): Promise<Response> {
  const html = await readFile(clientIndexPath, 'utf8');
  return new Response(injectRuntimeConfig(html, runtimeConfig), {
    headers: {
      'cache-control': 'no-cache',
      'content-type': 'text/html; charset=utf-8',
    },
  });
}

function injectRuntimeConfig(
  html: string,
  runtimeConfig: ClientRuntimeConfig,
): string {
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
  const pattern = new RegExp(
    `${runtimeConfigStartMarker}[\\s\\S]*?${runtimeConfigEndMarker}\\s*`,
    'g',
  );
  return html.replace(pattern, '');
}

function createRuntimeConfigHtml({
  appBasePath,
  apiUrl,
  storagePrefix,
  storageType,
  shareToken,
}: ClientRuntimeConfig): string {
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
      : (Readable.toWeb(createReadStream(filePath)) as ConstructorParameters<
          typeof Response
        >[0]);
  return new Response(body, { headers });
}

function getPathInsideClient(pathname: string, basePath: string): string {
  const pathInside =
    basePath && pathname.startsWith(basePath)
      ? pathname.slice(basePath.length)
      : pathname;
  return pathInside.startsWith('/') ? pathInside : `/${pathInside}`;
}

function resolveClientFile(
  rootDir: string,
  requestPath: string,
): string | null {
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
  return (
    contentTypes[path.extname(filePath).toLowerCase()] ??
    'application/octet-stream'
  );
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
