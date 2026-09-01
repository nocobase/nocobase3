#!/usr/bin/env node

import process from 'node:process';

import { startAppHostFromEnv, type AppHost } from './index.ts';

let appHost: AppHost | null = null;
let shuttingDown = false;

const shutdown = async (): Promise<void> => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  if (appHost) {
    appHost.logger.info('Shutting down app host');
    await appHost.close('host shutdown');
  }
  process.exit(0);
};

const handleShutdownSignal = (): void => {
  const shutdownPromise = shutdown();
  shutdownPromise.catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
};

process.once('SIGINT', handleShutdownSignal);
process.once('SIGTERM', handleShutdownSignal);

startAppHostFromEnv()
  .then((host) => {
    appHost = host;
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
