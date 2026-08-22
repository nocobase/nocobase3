import type { SpaHandler } from '@nocobase/app-server/spa';
import type { LoadedAppPluginRoutes } from './plugins/index.js';

export type AppDisposer = () => void | Promise<void>;

export interface AppLifecycle {
  registerDisposer(name: string, dispose: AppDisposer): void;
}

export interface CreateAppOptions {
  lifecycle: AppLifecycle;
  pluginRoutes?: readonly LoadedAppPluginRoutes[];
  spa?: CreateAppSpaOptions;
}

export interface CreateAppSpaOptions {
  handler?: SpaHandler;
}

export type { SpaHandler };
