import net from 'node:net';

export const canListen = (host, port) =>
  new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.listen(port, host, () => {
      server.close(() => {
        resolve(true);
      });
    });
  });

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
