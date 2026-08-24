import type { CreateFilesRuntimeOptions, FilesRuntime } from '../runtime.js';
import { createFileCapabilityCodec } from './capability.js';
import { createFilesDataPlane, type FilesDataPlane } from './data-plane.js';
import {
  createFileKernel,
  type CleanupExpiredUploadsResult,
  type FileKernel,
} from './kernel.js';
import { createFilesRepository } from './repository.js';
import {
  createScopedFileCapabilityCodec,
  type ScopedFileCapabilityCodec,
} from './scoped-capability.js';
import { createInternalFilesStorage } from './storage/index.js';
import type { InternalFilesStorage, S3Provider } from './storage/types.js';

interface FilesRuntimeState {
  scopedCapabilityCodec: ScopedFileCapabilityCodec;
  dataPlane: FilesDataPlane;
  database: CreateFilesRuntimeOptions['database'];
  connection: string | undefined;
  kernel: FileKernel;
  storage: InternalFilesStorage;
  clock: () => Date;
  cleanupHandlers: Set<FilesCleanupHandler>;
}

export interface FilesCleanupHandlerInput {
  now: Date;
  limit: number;
  deadline?: number;
}

export interface FilesCleanupHandlerResult {
  scanned: number;
  released: number;
  hasMore: boolean;
}

export type FilesCleanupHandler = (
  input: FilesCleanupHandlerInput,
) => Promise<FilesCleanupHandlerResult>;

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
  const scopedCapabilityCodec = createScopedFileCapabilityCodec({
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
    scopedCapabilityCodec,
    dataPlane,
    database: options.database,
    connection: options.connection,
    kernel,
    storage,
    clock,
    cleanupHandlers: new Set(),
  });
  return runtime;
}

export interface FilesRuntimeServiceState {
  scopedCapabilityCodec: ScopedFileCapabilityCodec;
  dataPlane: FilesDataPlane;
  database: CreateFilesRuntimeOptions['database'];
  connection: string | undefined;
  kernel: FileKernel;
  clock: () => Date;
  registerCleanupHandler(handler: FilesCleanupHandler): () => void;
}

export function getFilesRuntimeServiceState(
  runtime: FilesRuntime,
): FilesRuntimeServiceState {
  const state = runtimeStates.get(runtime);
  if (!state) {
    throw new Error('Files runtime is invalid or disposed.');
  }
  return {
    scopedCapabilityCodec: state.scopedCapabilityCodec,
    dataPlane: state.dataPlane,
    database: state.database,
    connection: state.connection,
    kernel: state.kernel,
    clock: state.clock,
    registerCleanupHandler(handler: FilesCleanupHandler): () => void {
      state.cleanupHandlers.add(handler);
      return () => state.cleanupHandlers.delete(handler);
    },
  };
}

export interface RunFilesCleanupOptions {
  batchSize?: number;
  timeBudgetMs?: number;
}

export interface RunFilesCleanupResult {
  pending: CleanupExpiredUploadsResult;
  reservationsReleased: number;
  hasMore: boolean;
}

export async function runFilesCleanup(
  runtime: FilesRuntime,
  options: RunFilesCleanupOptions = {},
): Promise<RunFilesCleanupResult> {
  const state = runtimeStates.get(runtime);
  if (!state) {
    throw new Error('Files runtime is invalid or disposed.');
  }
  const batchSize = options.batchSize ?? 100;
  const timeBudgetMs = options.timeBudgetMs ?? 5_000;
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new Error('Files cleanup batch size must be a positive integer.');
  }
  if (!Number.isSafeInteger(timeBudgetMs) || timeBudgetMs <= 0) {
    throw new Error('Files cleanup time budget must be a positive integer.');
  }
  const deadline = Date.now() + timeBudgetMs;
  const pending = await state.kernel.cleanupExpiredUploads({
    limit: batchSize,
    now: state.clock(),
    deadline,
  });
  let reservationsReleased = 0;
  let hasMore = pending.hasMore;
  let reservationBudget = Math.max(0, batchSize - pending.scanned);
  for (const handler of state.cleanupHandlers) {
    if (Date.now() >= deadline || reservationBudget <= 0) {
      hasMore = true;
      break;
    }
    const result = await handler({
      now: state.clock(),
      limit: reservationBudget,
      deadline,
    });
    reservationBudget -= result.scanned;
    reservationsReleased += result.released;
    hasMore ||= result.hasMore;
  }
  return { pending, reservationsReleased, hasMore };
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
