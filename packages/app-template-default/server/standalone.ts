import path from 'node:path';

import {
  defineStandaloneServer,
  type StandaloneServer as CoreStandaloneServer,
  type StandaloneServerOptions as CoreStandaloneServerOptions,
} from '@nocobase/app-server-kit/node';

import type { AppConfig } from './config/index.js';
import type { DefaultAppScopeConfig } from './config/types.js';
import { createServer } from './embedded.js';
import appRuntime from './runtime.js';

const standalone = defineStandaloneServer({
  rootDir: path.resolve(import.meta.dirname, '..'),
  appRuntime,
  createServer,
});

export type StandaloneServer = CoreStandaloneServer<AppConfig>;

export type StandaloneServerOptions =
  CoreStandaloneServerOptions<DefaultAppScopeConfig>;

export const createStandaloneServer: (
  options?: StandaloneServerOptions,
) => Promise<StandaloneServer> = standalone.create;

export const startServer: (options?: StandaloneServerOptions) => void =
  standalone.start;

if (import.meta.main) startServer();
