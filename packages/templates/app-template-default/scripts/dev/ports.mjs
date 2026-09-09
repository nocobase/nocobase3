import net from 'node:net';

// A wildcard bind succeeds even when another process already listens on a
// specific address of the same port, and the kernel then routes loopback
// traffic to that more specific listener. Readiness is probed over loopback,
// so the probe would reach the other process and never observe our own server
// starting. Probing the loopback addresses behind each wildcard keeps port
// selection consistent with the address the port is actually reached on.
const WILDCARD_LOOPBACK_ADDRESSES = {
  '0.0.0.0': ['127.0.0.1'],
  '::': ['::1', '127.0.0.1'],
};

const listenErrorCode = (host, port) =>
  new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (error) => {
      resolve(error.code ?? 'EADDRINUSE');
    });

    server.listen(port, host, () => {
      server.close(() => {
        resolve(undefined);
      });
    });
  });

export const canListen = async (host, port) => {
  if ((await listenErrorCode(host, port)) !== undefined) {
    return false;
  }

  for (const address of WILDCARD_LOOPBACK_ADDRESSES[host] ?? []) {
    // An address that cannot be probed at all, such as IPv6 loopback on a host
    // without an IPv6 stack, says nothing about the port. Only a genuine
    // conflict rules the port out.
    if ((await listenErrorCode(address, port)) === 'EADDRINUSE') {
      return false;
    }
  }

  return true;
};

export const findAvailablePort = async ({
  excludedPorts = [],
  host,
  label,
  preferredPort,
}) => {
  const excluded = new Set(excludedPorts);

  for (let port = preferredPort; port < preferredPort + 100; port += 1) {
    if (!excluded.has(port) && (await canListen(host, port))) {
      return port;
    }
  }

  throw new Error(
    `Unable to find an available ${label} port from ${preferredPort} to ${preferredPort + 99}.`,
  );
};
