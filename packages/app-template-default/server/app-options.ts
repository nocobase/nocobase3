import type { SpaHandler } from '@nocobase/app-server-kit/spa';
import type {
  LoadedAppPluginBootstrap,
  LoadedAppPluginRoutes,
} from './plugins/index.js';

export type AppDisposer = () => void | Promise<void>;

export interface AppLifecycle {
  registerDisposer(name: string, dispose: AppDisposer): void;
}

export interface CreateAppOptions {
  lifecycle: AppLifecycle;
  pluginBootstraps?: readonly LoadedAppPluginBootstrap[];
  pluginRoutes?: readonly LoadedAppPluginRoutes[];
  spa?: CreateAppSpaOptions;
}

export interface CreateAppSpaOptions {
  handler?: SpaHandler;
}

export type { SpaHandler };
