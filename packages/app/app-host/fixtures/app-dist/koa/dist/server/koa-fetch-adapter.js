import { createServer } from 'node:http';

const REQUEST_HOP_BY_HOP_HEADERS = [
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

const RESPONSE_HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

export async function createKoaFetchAdapter(koa) {
  const server = createServer(koa.callback());
  const origin = await listenOnLoopback(server);

  return {
    async fetch(request) {
      const target = new URL(request.url);
      target.protocol = origin.protocol;
      target.hostname = origin.hostname;
      target.port = origin.port;

      const headers = copyHeadersWithout(
        request.headers,
        REQUEST_HOP_BY_HOP_HEADERS,
      );
      headers.set('accept-encoding', 'identity');

      const init = {
        method: request.method,
        headers,
        redirect: 'manual',
        signal: request.signal,
      };

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = request.body;
        init.duplex = 'half';
      }

      const response = await fetch(target, init);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: copyHeadersWithout(
          response.headers,
          RESPONSE_HOP_BY_HOP_HEADERS,
        ),
      });
    },
    close() {
      return closeServer(server);
    },
  };
}

function copyHeadersWithout(source, excludedNames) {
  const headers = new Headers(source);
  for (const name of excludedNames) {
    headers.delete(name);
  }
  return headers;
}

async function listenOnLoopback(server) {
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    await closeServer(server);
    throw new Error('Koa adapter did not expose a TCP address');
  }

  return new URL(`http://127.0.0.1:${address.port}`);
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
