/// <reference types="vite/client" />

interface Window {
  [key: string]: unknown;
}

declare module 'virtual:nocobase-app-client-plugins' {
  import type { AppClientPluginLoader } from '@nocobase/app-client/plugins';

  export const appClientPluginLoaders: readonly AppClientPluginLoader[];
}
