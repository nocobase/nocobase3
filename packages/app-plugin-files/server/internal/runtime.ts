import type { CreateFilesRuntimeOptions, FilesRuntime } from '../runtime.js';
import { createFileCapabilityCodec } from './capability.js';
import { createFilesDataPlane, type FilesDataPlane } from './data-plane.js';
import { createFileKernel, type FileKernel } from './kernel.js';
import { createFilesRepository } from './repository.js';
import { createInternalFilesStorage } from './storage/index.js';
import type { InternalFilesStorage, S3Provider } from './storage/types.js';

interface FilesRuntimeState {
  dataPlane: FilesDataPlane;
  kernel: FileKernel;
  storage: InternalFilesStorage;
}

export interface CreateOpaqueFilesRuntimeInternalOptions {
  basePath?: string;
  clock?: () => Date;
  s3Provider?: S3Provider;
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
  internalOptions: CreateOpaqueFilesRuntimeInternalOptions = {},
): FilesRuntime {
  const storage = createInternalFilesStorage(options.config, {
    ...(internalOptions.s3Provider === undefined
      ? {}
      : { s3Provider: internalOptions.s3Provider }),
  });
  const repository = createFilesRepository(
    options.database,
    options.connection,
  );
  const kernel = createFileKernel({
    repository,
    storage,
    uploadExpiresInSeconds: options.config.upload.expiresInSeconds,
    ...(internalOptions.clock === undefined
      ? {}
      : { clock: internalOptions.clock }),
  });
  const capabilityCodec = createFileCapabilityCodec({
    audience: options.audience,
    secret: options.secret,
    ...(internalOptions.clock === undefined
      ? {}
      : { clock: internalOptions.clock }),
  });
  const dataPlane = createFilesDataPlane({
    config: options.config,
    kernel,
    storage,
    capabilityCodec,
    ...(internalOptions.clock === undefined
      ? {}
      : { clock: internalOptions.clock }),
    ...(internalOptions.basePath === undefined
      ? {}
      : { basePath: internalOptions.basePath }),
  });
  const runtime = new OpaqueFilesRuntime();
  runtimeStates.set(runtime, { dataPlane, kernel, storage });
  return runtime;
}

export function getFilesRuntimeKernel(runtime: FilesRuntime): FileKernel {
  const state = runtimeStates.get(runtime);
  if (!state) {
    throw new Error('Files runtime is invalid or disposed.');
  }
  return state.kernel;
}

export function getFilesRuntimeDataPlane(
  runtime: FilesRuntime,
): FilesDataPlane {
  const state = runtimeStates.get(runtime);
  if (!state) {
    throw new Error('Files runtime is invalid or disposed.');
  }
  return state.dataPlane;
}
