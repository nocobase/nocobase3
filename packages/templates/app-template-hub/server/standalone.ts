import path from 'node:path';
import { hubServiceToken } from '@nocobase/app-plugin-hub/server';

import {
  defineStandaloneServer,
  type StandaloneServer as CoreStandaloneServer,
  type StandaloneServerOptions as CoreStandaloneServerOptions,
} from '@nocobase/app-server/node';

import { createServer } from './embedded.js';
import appRuntime from './runtime.js';

const standalone = defineStandaloneServer({
  rootDir: path.resolve(import.meta.dirname, '..'),
  appRuntime,
  createServer,
  // Forward outside the Hub mount before application routing can return a 404.
  proxy: ({ application }) => {
    const basePath = application.publicBasePath;
    const hub = application.container.resolve(hubServiceToken);
    return {
      match: (pathname) =>
        Boolean(basePath) &&
        pathname !== basePath &&
        !pathname.startsWith(`${basePath}/`),
      target: () => hub.getHostProxyTarget(),
    };
  },
});

export type StandaloneServer = CoreStandaloneServer;

export type StandaloneServerOptions = CoreStandaloneServerOptions;

export const createStandaloneServer: (
  options?: StandaloneServerOptions,
) => Promise<StandaloneServer> = standalone.create;

export const startServer: (options?: StandaloneServerOptions) => void =
  standalone.start;

if (import.meta.main) startServer();
