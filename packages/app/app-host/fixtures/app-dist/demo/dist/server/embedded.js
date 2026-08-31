import { readFile } from 'node:fs/promises';
import path from 'node:path';

export function createServer(scope) {
  return {
    async fetch(request) {
      const url = new URL(request.url);

      if (url.pathname === '/healthz') {
        return Response.json({
          ok: true,
          id: scope.id,
          requestPath: url.pathname,
        });
      }

      if (url.pathname.startsWith('/api/')) {
        return Response.json({
          id: scope.id,
          basePath: scope.basePath,
          assetsBasePath: scope.assetsBasePath,
          requestPath: url.pathname,
        });
      }

      const html = await readFile(path.join(scope.clientDir, 'index.html'), 'utf8');
      return new Response(rewriteAssetPaths(html, scope.assetsBasePath), {
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
      });
    },
  };
}

function rewriteAssetPaths(html, assetsBasePath) {
  return html.replace(/\b(src|href)=(["'])\/assets\//g, (_match, attribute, quote) => {
    return `${attribute}=${quote}${assetsBasePath}/`;
  });
}
