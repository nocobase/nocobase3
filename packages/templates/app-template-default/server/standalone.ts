import path from 'node:path';

import {
  defineStandaloneServer,
  type StandaloneServer as CoreStandaloneServer,
  type StandaloneServerOptions as CoreStandaloneServerOptions,
} from '@nocobase/app-server-kit/node';

import { createServer } from './embedded.js';
import appRuntime from './runtime.js';
import { nodeServerConfig as serverConfig } from '@nocobase/app-server-kit/node';

const standalone = defineStandaloneServer({
  rootDir: path.resolve(import.meta.dirname, '..'),
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
