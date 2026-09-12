/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { AppDefinition } from './app-types.ts';

const ONE_YEAR_SECONDS = 31_536_000;

const CONTENT_TYPES: Record<string, string> = {
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

export async function serveAppAssets(
  definition: AppDefinition,
  req: IncomingMessage,
  pathInsideApp: string,
): Promise<Response | null> {
  if (!isAppAssetPath(pathInsideApp) || !definition.client?.assetsDir) {
    return null;
  }

  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    return methodNotAllowed('GET, HEAD');
  }

  const fileResponse = await serveFileIfExists(
    definition.client.rootDir,
    pathInsideApp,
    method,
    {
      cacheControl: `public, max-age=${ONE_YEAR_SECONDS}, immutable`,
    },
  );
  if (!fileResponse) {
    return null;
  }

  return fileResponse;
}

export function isAppAssetPath(pathInsideApp: string): boolean {
  return pathInsideApp === '/assets' || pathInsideApp.startsWith('/assets/');
}

export function getPathInsideApp(
  definition: AppDefinition,
  hostPath: string,
): string {
  const pathInside = hostPath.slice(definition.basePath.length) || '/';
  return pathInside.startsWith('/') ? pathInside : `/${pathInside}`;
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
      : (Readable.toWeb(createReadStream(filePath)) as BodyInit);
  return new Response(body, { headers });
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

  const normalizedPath = decodedPath.replace(/^\/+/, '') || 'index.html';
  const filePath = path.resolve(rootDir, normalizedPath);
  const relative = path.relative(rootDir, filePath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  return filePath;
}

function contentTypeFor(filePath: string): string {
  return (
    CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
    'application/octet-stream'
  );
}

function methodNotAllowed(allow: string): Response {
  return new Response(
    JSON.stringify({
      error: 'Method not allowed',
    }),
    {
      status: 405,
      headers: {
        allow,
        'content-type': 'application/json',
      },
    },
  );
}
