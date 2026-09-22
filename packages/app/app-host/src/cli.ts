#!/usr/bin/env node

import process from 'node:process';

import { watchStartupShutdownSignals } from '@nocobase/app-server/node';

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

// Until the host exists there is nothing to shut down, and exiting outright
// would abandon the migration and seed locks that startup holds. The signal is
// recorded instead and answered once startup has released them.
const startupSignals = watchStartupShutdownSignals();

startAppHostFromEnv()
  .then((host) => {
    appHost = host;
    const startupSignal = startupSignals.received();
    startupSignals.dispose();
    if (startupSignal) {
      handleShutdownSignal();
      return;
    }

    process.once('SIGINT', handleShutdownSignal);
    process.once('SIGTERM', handleShutdownSignal);
  })
  .catch((error) => {
    startupSignals.dispose();
    console.error(error);
    process.exit(1);
  });
