import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { assertConfigurationPresent } from './utils/config-presence.mjs';

process.env.NODE_ENV ||= 'production';

const rootDir = path.resolve(process.env.NOCOBASE_TOOL_ROOT || process.cwd());

let startServer;

try {
  ({ startServer } = await import(
    pathToFileURL(path.join(rootDir, 'dist/server/standalone.js')).href
  ));
} catch (error) {
  if (error?.code === 'ERR_MODULE_NOT_FOUND') {
    console.error('Missing dist/server/standalone.js. Run pnpm build first.');
    process.exit(1);
  }

  throw error;
}

// After the build check and before the server runs. An application that has not been built is not yet an application
// to configure, so reporting a missing configuration first would name the further of the two problems.
assertConfigurationPresent(rootDir, process.env, 'start');

startServer();
