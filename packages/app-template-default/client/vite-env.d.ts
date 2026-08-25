/// <reference types="vite/client" />

declare const __PORTAL_TEMPLATE_NAME__: string;
declare const __PORTAL_TEMPLATE_VERSION__: string;

interface Window {
  [key: string]: unknown;
}

declare module 'virtual:nocobase-app-client-plugins' {
  import type { AppClientPluginLoader } from '@nocobase/app-client/plugins';

  export const appClientPluginLoaders: readonly AppClientPluginLoader[];
}
