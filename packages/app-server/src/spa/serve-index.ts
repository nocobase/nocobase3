import { readFile } from 'node:fs/promises';

import { injectSpaRuntimeGlobals } from './runtime-globals.js';
import type { SpaRuntimeGlobals } from './types.js';

export async function serveSpaIndex(
  indexPath: string,
  runtimeGlobals?: SpaRuntimeGlobals,
): Promise<Response> {
  const html = await readFile(indexPath, 'utf8');
  return new Response(injectSpaRuntimeGlobals(html, runtimeGlobals), {
    headers: {
      'cache-control': 'no-cache',
      'content-type': 'text/html; charset=utf-8',
    },
  });
}
