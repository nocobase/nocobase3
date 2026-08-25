import type { AppPluginRoutesContext } from '@nocobase/app-server-kit/plugins';

import { getFilesRuntimeDataPlane } from '../internal/runtime.js';
import type { FilesRuntime } from '../runtime.js';

export interface FilesPluginRoutesDeps {
  filesRuntime?: FilesRuntime;
}

export type FilesPluginRoutesContext = AppPluginRoutesContext<
  FilesPluginRoutesDeps,
  unknown
>;

export default function registerFilesRoutes({
  api,
  deps,
}: FilesPluginRoutesContext): void {
  if (!deps.filesRuntime) {
    throw new Error('The Files plugin runtime is not initialized.');
  }

  api.route(
    '/files',
    getFilesRuntimeDataPlane(deps.filesRuntime).createRoute(),
  );
}
