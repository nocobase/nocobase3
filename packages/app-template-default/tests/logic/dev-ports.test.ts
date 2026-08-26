// @vitest-environment node

import net from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { findAvailablePort } from '../../scripts/dev-ports.mjs';

const servers: net.Server[] = [];
const host = '127.0.0.1';

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

describe('development ports', () => {
  it('uses the preferred port when it is available', async () => {
    const preferredPort = await reserveAvailablePort();

    expect(
      await findAvailablePort({
        host,
        label: 'test',
        preferredPort,
      }),
    ).toBe(preferredPort);
  });

  it('selects the next available port when the preferred port is busy', async () => {
    const preferredPort = await listenOnAvailablePort();

    expect(
      await findAvailablePort({
        host,
        label: 'test',
        preferredPort,
      }),
    ).toBeGreaterThan(preferredPort);
  });

  it('does not reuse a port already allocated to another dev process', async () => {
    const preferredPort = await reserveAvailablePort();

    expect(
      await findAvailablePort({
        excludedPorts: [preferredPort],
        host,
        label: 'test',
        preferredPort,
      }),
    ).toBeGreaterThan(preferredPort);
  });
});

async function listenOnAvailablePort(): Promise<number> {
  const server = net.createServer();
  servers.push(server);

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to resolve the temporary test port.'));
        return;
      }
      resolve(address.port);
    });
  });
}

async function reserveAvailablePort(): Promise<number> {
  const port = await listenOnAvailablePort();
  const server = servers.pop();
  if (!server) {
    throw new Error('Unable to reserve a temporary test port.');
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  return port;
}
