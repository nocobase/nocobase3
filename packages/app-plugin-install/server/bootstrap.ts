import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';

export type InstallPluginServerContext = AppPluginServerContext;

export default function bootstrapInstallPlugin(
  _context: InstallPluginServerContext,
): void {
  // Register plugin resources and lifecycle disposers here.
}
