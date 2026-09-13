import path from 'node:path';

import {
  defineStandaloneServer,
  type StandaloneServer as CoreStandaloneServer,
  type StandaloneServerOptions as CoreStandaloneServerOptions,
} from '@nocobase/app-server/node';

import { createServer } from './embedded.js';
import appRuntime from './runtime.js';
import { nodeServerConfig as serverConfig } from '@nocobase/app-server/node';

export function resolveStandaloneRootDir(entryDir: string): string {
  const resolvedEntryDir = path.resolve(entryDir);
  const parentDir = path.dirname(resolvedEntryDir);

  return path.basename(parentDir) === 'dist'
    ? path.resolve(resolvedEntryDir, '../..')
    : path.resolve(resolvedEntryDir, '..');
}

const standalone = defineStandaloneServer({
  // Source runs from `server/`; the compiled entry runs from `dist/server/`. Both use the application root for config,
  // storage, and the built client.
  rootDir: resolveStandaloneRootDir(import.meta.dirname),
  appRuntime,
  serverConfig,
  createServer,
});

export type StandaloneServer = CoreStandaloneServer;

export type StandaloneServerOptions = CoreStandaloneServerOptions;

export const createStandaloneServer: (
  options?: StandaloneServerOptions,
) => Promise<StandaloneServer> = standalone.create;

export const startServer: (options?: StandaloneServerOptions) => void =
  standalone.start;

if (import.meta.main) startServer();
