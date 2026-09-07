import { serve, type ServerType } from '@hono/node-server';
import { cleanPlaygroundDatabase } from './database/index.js';
import { createDatabasePlayground } from './app.js';

interface PlaygroundCommandOptions {
  readonly port: number;
  readonly hostname: string;
  readonly reset: boolean;
}

async function main(args: readonly string[]): Promise<void> {
  if (args[0] === 'clean') {
    if (args.length > 1) unexpected(args[1]);
    await cleanPlaygroundDatabase();
    console.log('Removed retained @nocobase/db playground databases.');
    return;
  }
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const options = parseOptions(args);
  const playground = await createDatabasePlayground({ reset: options.reset });
  const server = serve({
    fetch: playground.app.fetch,
    hostname: options.hostname,
    port: options.port,
  });
  const shutdown = async (): Promise<void> => {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    await closeServer(server);
    await playground.close();
  };
  const onSignal = (): void => {
    void shutdown().catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  console.log('@nocobase/db Commerce Playground');
  console.log(`Web:          http://${options.hostname}:${options.port}`);
  console.log(`Main DB:      ${playground.database.paths.main}`);
  console.log(`External CRM: ${playground.database.paths.crm}`);
  console.log('Press Ctrl+C to stop. Databases are retained.');
}

function parseOptions(args: readonly string[]): PlaygroundCommandOptions {
  let port = 3100;
  let hostname = '127.0.0.1';
  let reset = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--reset') {
      reset = true;
      continue;
    }
    if (argument === '--port') {
      port = parsePort(args[index + 1]);
      index += 1;
      continue;
    }
    if (argument === '--host') {
      hostname = args[index + 1] ?? '';
      if (!hostname) throw new Error('--host requires a hostname.');
      index += 1;
      continue;
    }
    unexpected(argument);
  }
  return { port, hostname, reset };
}

function parsePort(input: string | undefined): number {
  const port = Number(input);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('--port requires an integer between 1 and 65535.');
  }
  return port;
}

function unexpected(argument: string | undefined): never {
  throw new Error(`Unexpected playground argument "${String(argument)}".`);
}

function printHelp(): void {
  console.log('Usage: pnpm --filter @nocobase/db playground [options]');
  console.log('');
  console.log('  --reset       Recreate and seed both SQLite databases.');
  console.log('  --port <port> HTTP port (default: 3100).');
  console.log('  --host <host> HTTP hostname (default: 127.0.0.1).');
  console.log('  clean         Remove retained playground databases.');
}

function closeServer(server: ServerType): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
