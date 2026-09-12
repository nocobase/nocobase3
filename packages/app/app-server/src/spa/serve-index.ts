import { readFile } from 'node:fs/promises';

import { injectSpaRuntimeHtml } from './runtime-globals.js';
import type { SpaClientConfigMap, SpaRuntimeGlobals } from './types.js';

export async function serveSpaIndex(
  indexPath: string,
  runtimeGlobals?: SpaRuntimeGlobals,
  clientConfig?: SpaClientConfigMap,
): Promise<Response> {
  const html = await readFile(indexPath, 'utf8');
  return new Response(
    injectSpaRuntimeHtml(html, { clientConfig, runtimeGlobals }),
    {
      headers: {
        'cache-control': 'no-cache',
        'content-type': 'text/html; charset=utf-8',
      },
    },
  );
}
