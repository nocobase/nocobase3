// @vitest-environment node

import http from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { waitForHttpReady } from '../../scripts/dev-readiness.mjs';

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        }),
    ),
  );
});

describe('development server readiness', () => {
  it('waits until the endpoint returns a ready response', async () => {
    let ready = false;
    const url = await listen((_, response) => {
      response.writeHead(ready ? 200 : 503);
      response.end();
    });
    let resolved = false;
    const waiting = waitForHttpReady({
      intervalMs: 5,
      label: 'Test server',
      timeoutMs: 1_000,
      url,
    }).then(() => {
      resolved = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(resolved).toBe(false);

    ready = true;
    await waiting;
    expect(resolved).toBe(true);
  });

  it('supports validating the readiness response body', async () => {
    const url = await listen((_, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ ok: true }));
    });

    await expect(
      waitForHttpReady({
        isReady: (_, body) => JSON.parse(body).ok === true,
        label: 'Health endpoint',
        timeoutMs: 1_000,
        url,
      }),
    ).resolves.toBeUndefined();
  });

  it('reports the endpoint and last response when readiness times out', async () => {
    const url = await listen((_, response) => {
      response.writeHead(503);
      response.end();
    });

    await expect(
      waitForHttpReady({
        intervalMs: 5,
        label: 'Test server',
        timeoutMs: 25,
        url,
      }),
    ).rejects.toThrow(
      `Test server did not become ready at ${url} within 25ms: HTTP 503`,
    );
  });
});

async function listen(listener: http.RequestListener): Promise<string> {
  const server = http.createServer(listener);
  servers.push(server);

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to resolve the temporary test port.'));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}/healthz`);
    });
  });
}
