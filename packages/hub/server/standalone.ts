import { serve } from '@hono/node-server';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp, normalizeBasePath } from './app.js';
import {
  type EnvMap,
  getEnvBoolean,
  getEnvString,
  readEnvFiles,
} from './env.js';

export interface StandaloneServerOptions {
  viteDevUrl?: string | false;
}

export function createStandaloneServer(
  options: StandaloneServerOptions = {},
): ReturnType<typeof createApp> {
  const env = loadServerEnv();

  const viteDevUrl = resolveViteDevUrl(options.viteDevUrl, env);
  const packageRoot = getPackageRoot();
  const appName = getEnvString(env, 'APP_NAME') ?? 'hub';
  const basePath = normalizeBasePath(
    getEnvString(env, 'APP_BASE_PATH') ?? `/${appName}`,
  );
  const browserBasePath = normalizeBasePath(
    getEnvString(env, 'APP_BROWSER_BASE_PATH') ?? basePath,
  );
  return createApp({
    appName,
    basePath,
    browserBasePath,
    clientHandler: viteDevUrl
      ? (request) => proxyToViteDevServer(request, viteDevUrl)
      : undefined,
    clientIndexPath:
      getEnvString(env, 'APP_CLIENT_INDEX') ??
      path.join(packageRoot, 'dist/client/index.html'),
    apiClientStoragePrefix: getEnvString(env, 'API_CLIENT_STORAGE_PREFIX'),
    apiClientStorageType: getEnvString(env, 'API_CLIENT_STORAGE_TYPE'),
    apiClientShareToken: getEnvBoolean(env, 'API_CLIENT_SHARE_TOKEN'),
  });
}

export function startServer(): void {
  const env = loadServerEnv();
  const app = createStandaloneServer();
  const host = getEnvString(env, 'APP_SERVER_HOST') ?? '127.0.0.1';
  const port = numberFromEnv(env, 'APP_SERVER_PORT') ?? 13000;

  serve(
    {
      fetch: app.fetch,
      hostname: host,
      port,
    },
    (info) => {
      if (getEnvString(env, 'APP_SERVER_START_LOG') !== 'false') {
        console.log(
          `App server listening on http://${info.address}:${info.port}`,
        );
      }
    },
  );
}

function resolveViteDevUrl(
  value: string | false | undefined,
  env: EnvMap,
): URL | undefined {
  if (value === false || getEnvString(env, 'NODE_ENV') === 'production') {
    return undefined;
  }

  const raw =
    value ??
    getEnvString(env, 'APP_VITE_DEV_URL') ??
    resolveViteDevUrlFromEnv(env);
  if (!raw) {
    return undefined;
  }

  const normalized = raw.trim();
  if (!normalized || normalized === 'false' || normalized === '0') {
    return undefined;
  }

  return new URL(normalized);
}

function resolveViteDevUrlFromEnv(env: EnvMap): string | undefined {
  const host = getEnvString(env, 'APP_VITE_DEV_HOST');
  const port = getEnvString(env, 'APP_VITE_DEV_PORT');
  if (!host && !port) {
    return undefined;
  }

  return `http://${host ?? '127.0.0.1'}:${port ?? '5173'}`;
}

async function proxyToViteDevServer(
  request: Request,
  viteDevUrl: URL,
): Promise<Response> {
  const requestUrl = new URL(request.url);
  const targetUrl = new URL(
    `${requestUrl.pathname}${requestUrl.search}`,
    viteDevUrl,
  );
  const headers = new Headers(request.headers);
  headers.set('host', targetUrl.host);
  headers.set('accept-encoding', 'identity');
  alignRequestOrigin(headers, requestUrl.origin, viteDevUrl);
  removeHopByHopHeaders(headers);

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body:
        request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : request.body,
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
        error: 'Vite dev server is unavailable.',
        target: viteDevUrl.origin,
        message: error instanceof Error ? error.message : String(error),
      },
      {
        status: 502,
      },
    );
  }
}

function alignRequestOrigin(
  headers: Headers,
  requestOrigin: string,
  targetOrigin: URL,
): void {
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

function loadServerEnv(): EnvMap {
  const root = getPackageRoot();
  const envFiles = [path.join(root, '.env'), path.join(root, '.env.local')];
  return {
    ...readEnvFiles(envFiles, process.env),
    ...process.env,
  };
}

function getPackageRoot(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  if (path.basename(path.dirname(moduleDir)) === 'dist') {
    return path.resolve(moduleDir, '../..');
  }

  return path.resolve(moduleDir, '..');
}

function numberFromEnv(env: EnvMap, name: string): number | undefined {
  const value = getEnvString(env, name);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

if (isEntrypoint()) {
  startServer();
}

function isEntrypoint(): boolean {
  const entry = process.argv[1];
  return Boolean(
    entry && path.resolve(entry) === fileURLToPath(import.meta.url),
  );
}
