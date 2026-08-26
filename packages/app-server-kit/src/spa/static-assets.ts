import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import { contentTypeFor } from './content-types.js';

const oneYearSeconds = 31_536_000;

export interface ServeSpaAssetOptions {
  rootDir: string;
  basePath: string;
  cacheControl?: string;
}

export async function serveSpaAsset(
  request: Request,
  options: ServeSpaAssetOptions,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return methodNotAllowed('GET, HEAD');
  }

  const requestUrl = new URL(request.url);
  const pathInsideRoot = getPathInsideRoot(
    requestUrl.pathname,
    options.basePath,
  );
  const response = await serveFileIfExists(
    options.rootDir,
    pathInsideRoot,
    request.method,
    {
      cacheControl:
        options.cacheControl ?? `public, max-age=${oneYearSeconds}, immutable`,
    },
  );

  return response ?? notFound();
}

async function serveFileIfExists(
  rootDir: string,
  requestPath: string,
  method: string,
  options: { cacheControl?: string } = {},
): Promise<Response | null> {
  const filePath = resolveSpaFile(rootDir, requestPath);
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

function getPathInsideRoot(pathname: string, basePath: string): string {
  const pathInside =
    basePath && pathname.startsWith(basePath)
      ? pathname.slice(basePath.length)
      : pathname;
  return pathInside.startsWith('/') ? pathInside : `/${pathInside}`;
}

function resolveSpaFile(rootDir: string, requestPath: string): string | null {
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
