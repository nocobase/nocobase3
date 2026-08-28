import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { joinBasePath } from '../support/paths.js';
import { injectSpaRuntimeGlobals } from './runtime-globals.js';
import type { SpaRuntimeGlobals } from './types.js';

export async function serveSpaIndex(
  indexPath: string,
  runtimeGlobals?: SpaRuntimeGlobals,
): Promise<Response> {
  const html = await readRuntimeIndex(indexPath);
  const runtimeHtml = rewriteRootRelativeAssets(html, runtimeGlobals);
  return new Response(injectSpaRuntimeGlobals(runtimeHtml, runtimeGlobals), {
    headers: {
      'cache-control': 'no-cache',
      'content-type': 'text/html; charset=utf-8',
    },
  });
}

async function readRuntimeIndex(indexPath: string): Promise<string> {
  if (path.basename(indexPath) !== 'index.html') {
    return readFile(indexPath, 'utf8');
  }

  const rawIndexPath = path.join(path.dirname(indexPath), 'index.raw.html');
  try {
    return await readFile(rawIndexPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    return readFile(indexPath, 'utf8');
  }
}

function rewriteRootRelativeAssets(
  html: string,
  runtimeGlobals: SpaRuntimeGlobals | undefined,
): string {
  const portalBase = runtimeGlobals?.NOCOBASE_PORTAL_BASE;
  if (typeof portalBase !== 'string') {
    return html;
  }

  const attributePattern = /\b(src|href|content)=(["'])\/(assets\/[^"']*)\2/g;
  return html.replace(
    attributePattern,
    (_match, attribute: string, quote: string, assetPath: string) =>
      `${attribute}=${quote}${joinBasePath(portalBase, assetPath)}${quote}`,
  );
}
