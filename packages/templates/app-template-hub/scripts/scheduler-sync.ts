import path from 'node:path';

import { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';
import { schedulerStartupModeToken } from '@nocobase/app-plugin-scheduler/server/tokens';

import { createApp } from '../server/app.js';
import appRuntime from '../server/runtime.js';

const runtime = await resolveStandaloneAppRuntime(appRuntime, {
  rootDir: path.resolve(import.meta.dirname, '..'),
});
const app = createApp(runtime);
const finalize = process.argv.includes('--finalize');
app.container.instance(schedulerStartupModeToken, {
  kind: 'sync-only',
  finalize,
});
try {
  await app.start();
  console.log(
    finalize
      ? 'Schedule manifest synchronized and missing definitions deactivated.'
      : 'Schedule manifest synchronized.',
  );
} finally {
  await app.shutdown();
}
