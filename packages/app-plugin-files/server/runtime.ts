import type { DatabaseManager } from '@nocobase/database';

import type { FilesConfig } from './config.js';
import { createOpaqueFilesRuntime } from './internal/runtime.js';

export interface CreateFilesRuntimeOptions {
  database: DatabaseManager;
  config: FilesConfig;
  connection?: string;
}

export interface FilesRuntime {
  dispose(): Promise<void>;
}

export function createFilesRuntime(
  options: CreateFilesRuntimeOptions,
): FilesRuntime {
  return createOpaqueFilesRuntime(options);
}
