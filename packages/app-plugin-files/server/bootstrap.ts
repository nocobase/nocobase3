import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';

import { FILES_DEMO_FIXTURES } from './demo/fixtures.js';
import {
  createPluginFilesService,
  isFilesPluginServiceUnavailable,
  type FilesPluginConfig,
  type FilesPluginDeps,
} from './plugin-runtime.js';
import type { FilesService } from './types.js';

export type FilesPluginServerContext = AppPluginServerContext<
  FilesPluginDeps,
  unknown,
  FilesPluginConfig
>;

export default function bootstrapFilesPlugin(
  context: FilesPluginServerContext,
): void {
  const service = createPluginFilesService(context);
  if (isFilesPluginServiceUnavailable(service)) {
    return;
  }
  void ensureFilesDemoFixtures(service).catch(() => undefined);
}

export async function ensureFilesDemoFixtures(
  files: FilesService,
): Promise<void> {
  await Promise.all(
    FILES_DEMO_FIXTURES.map(async (fixture) => files.ensureObject(fixture)),
  );
}
