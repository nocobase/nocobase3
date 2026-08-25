/// <reference types='vite/client' />

interface Window {
  NOCOBASE_PORTAL_BASE?: string;
  NOCOBASE_API_URL?: string;
}

interface ImportMetaEnv {
  readonly NOCOBASE_API_URL?: string;
}

declare module 'virtual:nocobase-app-client-plugins' {
  import type { AppClientPluginLoader } from '@nocobase/app-client/plugins';
  export const appClientPluginLoaders: readonly AppClientPluginLoader[];
}
