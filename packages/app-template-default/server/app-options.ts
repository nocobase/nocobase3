import type { SpaHandler } from '@nocobase/app-server/spa';

export type AppDisposer = () => void | Promise<void>;

export interface AppLifecycle {
  registerDisposer(name: string, dispose: AppDisposer): void;
}

export interface CreateAppOptions {
  lifecycle: AppLifecycle;
  spa?: CreateAppSpaOptions;
}

export interface CreateAppSpaOptions {
  handler?: SpaHandler;
}

export type { SpaHandler };
