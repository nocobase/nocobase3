import type { CreateFilesRuntimeOptions, FilesRuntime } from '../runtime.js';
import { createFileKernel, type FileKernel } from './kernel.js';
import { createFilesRepository } from './repository.js';
import { createInternalFilesStorage } from './storage/index.js';
import type { InternalFilesStorage } from './storage/types.js';

interface FilesRuntimeState {
  kernel: FileKernel;
  storage: InternalFilesStorage;
}

const runtimeStates = new WeakMap<FilesRuntime, FilesRuntimeState>();

class OpaqueFilesRuntime implements FilesRuntime {
  #disposed = false;

  async dispose(): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    const state = runtimeStates.get(this);
    if (!state) {
      throw new Error('Files runtime state is unavailable.');
    }
    await state.storage.dispose();
    runtimeStates.delete(this);
  }
}

export function createOpaqueFilesRuntime(
  options: CreateFilesRuntimeOptions,
): FilesRuntime {
  const storage = createInternalFilesStorage(options.config);
  const repository = createFilesRepository(
    options.database,
    options.connection,
  );
  const kernel = createFileKernel({
    repository,
    storage,
    uploadExpiresInSeconds: options.config.upload.expiresInSeconds,
  });
  const runtime = new OpaqueFilesRuntime();
  runtimeStates.set(runtime, { kernel, storage });
  return runtime;
}

export function getFilesRuntimeKernel(runtime: FilesRuntime): FileKernel {
  const state = runtimeStates.get(runtime);
  if (!state) {
    throw new Error('Files runtime is invalid or disposed.');
  }
  return state.kernel;
}
