import type { AppPluginRoutesContext } from '@nocobase/app-server/plugins';
import type { Hono } from 'hono';

import { getFilesRuntimeDataPlane } from '../internal/runtime.js';
import type { FilesRuntime } from '../runtime.js';
import type { FileService } from '../types.js';

export interface FilesPluginRoutesDeps {
  filesRuntime?: FilesRuntime;
}

export interface FilesPluginRoutesServices {
  fileService?: FileService;
}

export type FilesPluginRoutesContext = AppPluginRoutesContext<
  FilesPluginRoutesDeps,
  FilesPluginRoutesServices
> & { readonly api: Hono };

export default function registerFilesRoutes({
  api,
  deps,
  services,
}: FilesPluginRoutesContext): void {
  if (!deps.filesRuntime || !services.fileService) {
    throw new Error('The Files plugin runtime is not initialized.');
  }

  api.route(
    '/files',
    getFilesRuntimeDataPlane(deps.filesRuntime).createRoute(),
  );
}
