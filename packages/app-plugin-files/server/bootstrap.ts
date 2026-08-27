import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';

export type FilesPluginServerContext = AppPluginServerContext;

export default function bootstrapFilesPlugin(
  _context: FilesPluginServerContext,
): void {}
