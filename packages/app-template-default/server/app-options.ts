import type { SpaHandler } from '@nocobase/app-server/spa';

export interface CreateAppOptions {
  spa?: CreateAppSpaOptions;
}

export interface CreateAppSpaOptions {
  handler?: SpaHandler;
}

export type { SpaHandler };
