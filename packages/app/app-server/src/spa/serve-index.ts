import { readFile } from 'node:fs/promises';

import { injectSpaRuntimeHtml } from './runtime-html.js';
import type { SpaClientConfigMap } from './types.js';

export async function serveSpaIndex(
  indexPath: string,
  clientConfig?: SpaClientConfigMap,
  publicConfig?: SpaClientConfigMap,
): Promise<Response> {
  const html = await readFile(indexPath, 'utf8');
  return new Response(
    injectSpaRuntimeHtml(html, { clientConfig, publicConfig }),
    {
      headers: {
        'cache-control': 'no-cache',
        'content-type': 'text/html; charset=utf-8',
      },
    },
  );
}
