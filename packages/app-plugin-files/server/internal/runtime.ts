import type { CreateFilesRuntimeOptions, FilesRuntime } from '../runtime.js';
import {
  createFileBindingCredentialCodec,
  type FileBindingCredentialCodec,
} from './binding-credential.js';
import { createFileCapabilityCodec } from './capability.js';
import { createFilesDataPlane, type FilesDataPlane } from './data-plane.js';
import { createFileKernel, type FileKernel } from './kernel.js';
import { createFilesRepository } from './repository.js';
import { createInternalFilesStorage } from './storage/index.js';
import type { InternalFilesStorage, S3Provider } from './storage/types.js';

interface FilesRuntimeState {
  bindingCredentialCodec: FileBindingCredentialCodec;
  dataPlane: FilesDataPlane;
  database: CreateFilesRuntimeOptions['database'];
  connection: string | undefined;
  publicAccessEnabled: boolean;
  kernel: FileKernel;
  storage: InternalFilesStorage;
  clock: () => Date;
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
  const clock = internalOptions.clock ?? (() => new Date());
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
    clock,
  });
  const capabilityCodec = createFileCapabilityCodec({
    audience: options.audience,
    secret: options.secret,
    clock,
  });
  const bindingCredentialCodec = createFileBindingCredentialCodec({
    audience: options.audience,
    secret: options.secret,
    clock,
  });
  const dataPlane = createFilesDataPlane({
    config: options.config,
    kernel,
    storage,
    clock,
    capabilityCodec,
    ...((internalOptions.basePath ?? options.basePath) === undefined
      ? {}
      : { basePath: internalOptions.basePath ?? options.basePath }),
  });
  const runtime = new OpaqueFilesRuntime();
  runtimeStates.set(runtime, {
    bindingCredentialCodec,
    dataPlane,
    database: options.database,
    connection: options.connection,
    publicAccessEnabled: options.config.publicAccess.enabled,
    kernel,
    storage,
    clock,
  });
  return runtime;
}

export interface FilesRuntimeServiceState {
  bindingCredentialCodec: FileBindingCredentialCodec;
  dataPlane: FilesDataPlane;
  database: CreateFilesRuntimeOptions['database'];
  connection: string | undefined;
  publicAccessEnabled: boolean;
  kernel: FileKernel;
  clock: () => Date;
}

export function getFilesRuntimeServiceState(
  runtime: FilesRuntime,
): FilesRuntimeServiceState {
  const state = runtimeStates.get(runtime);
  if (!state) {
    throw new Error('Files runtime is invalid or disposed.');
  }
  return {
    bindingCredentialCodec: state.bindingCredentialCodec,
    dataPlane: state.dataPlane,
    database: state.database,
    connection: state.connection,
    publicAccessEnabled: state.publicAccessEnabled,
    kernel: state.kernel,
    clock: state.clock,
  };
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
