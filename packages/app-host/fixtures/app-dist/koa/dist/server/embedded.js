import { Readable } from 'node:stream';
import Koa from 'koa';

import { createKoaFetchAdapter } from './koa-fetch-adapter.js';

export async function createServer(scope) {
  const koa = new Koa();

  koa.use(async (context, next) => {
    context.set('x-koa-middleware', 'active');
    await next();
  });

  koa.use(async (context) => {
    if (context.method === 'GET' && context.path === '/healthz') {
      context.body = {
        ok: true,
        framework: 'koa',
        id: scope.id,
      };
      return;
    }

    if (context.method === 'GET' && context.path === '/api/info') {
      context.cookies.set('koa-session', 'fixture', {
        httpOnly: true,
        sameSite: 'lax',
      });
      context.append('set-cookie', 'koa-adapter=loopback; Path=/');
      context.body = {
        framework: 'koa',
        id: scope.id,
        basePath: scope.basePath,
        requestPath: context.path,
        query: context.query,
      };
      return;
    }

    if (context.method === 'POST' && context.path === '/api/echo') {
      context.status = 201;
      context.body = {
        body: await readRequestBody(context.req),
        contentType: context.get('content-type'),
        requestPath: context.path,
      };
      return;
    }

    if (context.method === 'GET' && context.path === '/redirect') {
      context.redirect('/api/info');
      return;
    }

    if (context.method === 'GET' && context.path === '/stream') {
      context.type = 'text/plain; charset=utf-8';
      context.body = Readable.from(['Koa ', 'stream ', 'response']);
      return;
    }

    context.status = 404;
    context.body = {
      error: 'Not found',
      requestPath: context.path,
    };
  });

  const adapter = await createKoaFetchAdapter(koa);
  scope.registerDisposer('koa-loopback-server', () => adapter.close());
  return adapter;
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export default createServer;
