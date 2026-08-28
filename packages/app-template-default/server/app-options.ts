import type { SpaHandler } from '@nocobase/app-server-kit/spa';
import type {
  LoadedAppPluginProvider,
  LoadedAppPluginRoutes,
} from './plugins/index.js';

export type AppDisposer = () => void | Promise<void>;

export interface AppLifecycle {
  registerDisposer(name: string, dispose: AppDisposer): void;
}

export interface CreateAppOptions {
  lifecycle: AppLifecycle;
  pluginProviders: readonly LoadedAppPluginProvider[];
  pluginRoutes?: readonly LoadedAppPluginRoutes[];
  spa?: CreateAppSpaOptions;
}

export interface CreateAppSpaOptions {
  handler?: SpaHandler;
}

export type { SpaHandler };
