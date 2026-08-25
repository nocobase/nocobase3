import { normalizeBasePath } from '@nocobase/app-server-kit/support';
import type { Hono } from 'hono';

import type { FileUploadPlan, StoredFile } from '../protocol.js';
import type { FilesRuntime } from './runtime.js';
import type {
  CreateFileInput,
  CreateFileRouteOptions,
  CreateUploadInput,
  FileAccessOptions,
  FileService,
  OpenedFile,
  PublicAccessOptions,
} from './types.js';
import { fileNotFound, fileNotReady } from './internal/errors.js';
import { createFieldFileRoute } from './internal/field-route.js';
import { createRelationFileRoute } from './internal/relation-route.js';
import { invalidFileRoute } from './internal/route-errors.js';
import { getFilesRuntimeServiceState } from './internal/runtime.js';

export interface CreateFileServiceOptions {
  runtime: FilesRuntime;
  publicBasePath?: string;
}

class RuntimeFileService implements FileService {
  readonly #runtime: FilesRuntime;
  readonly #publicBasePath: string;

  constructor(options: CreateFileServiceOptions) {
    this.#runtime = options.runtime;
    this.#publicBasePath = normalizeBasePath(options.publicBasePath ?? '');
  }

  createFileRoute(options: CreateFileRouteOptions): Hono {
    if (!options || typeof options !== 'object') {
      throw invalidFileRoute('File route options are required.');
    }
    if (!options.binding) {
      throw invalidFileRoute('File route binding is required.');
    }
    const state = getFilesRuntimeServiceState(this.#runtime);
    if (options.binding.type === 'field') {
      return createFieldFileRoute({
        options,
        binding: options.binding,
        state,
        publicBasePath: this.#publicBasePath,
      });
    }
    if (options.binding.type === 'relation') {
      return createRelationFileRoute({
        options,
        binding: options.binding,
        state,
        publicBasePath: this.#publicBasePath,
      });
    }
    throw invalidFileRoute('File route binding type is invalid.');
  }

  async createUpload(input: CreateUploadInput): Promise<FileUploadPlan> {
    return runDirectService(() =>
      this.#state().dataPlane.createUploadPlan(input),
    );
  }

  async createFile(input: CreateFileInput): Promise<StoredFile> {
    return runDirectService(() => this.#state().dataPlane.createFile(input));
  }

  async getFile(fileId: string): Promise<StoredFile | null> {
    return runDirectService(async () => {
      return (await this.#state().kernel.getFile(fileId)) ?? null;
    });
  }

  async getFiles(
    fileIds: readonly string[],
  ): Promise<Array<StoredFile | null>> {
    return runDirectService(async () => {
      return await this.#state().kernel.getFiles(fileIds);
    });
  }

  async openFile(fileId: string): Promise<OpenedFile> {
    return runDirectService(() => this.#state().dataPlane.openFile(fileId));
  }

  async createTemporaryAccessUrl(
    fileId: string,
    options: FileAccessOptions = {},
  ): Promise<string> {
    return runDirectService(async () => {
      const dataPlane = this.#state().dataPlane;
      const access =
        options.expiresInSeconds === undefined
          ? await dataPlane.createReadAccess(
              fileId,
              options.disposition ?? 'attachment',
            )
          : await dataPlane.createReadAccess(
              fileId,
              options.disposition ?? 'attachment',
              options.expiresInSeconds,
            );
      return access.url;
    });
  }

  async cancelUpload(fileId: string): Promise<void> {
    await runDirectService(async () => {
      const kernel = this.#state().kernel;
      const current = await kernel.getFile(fileId);
      if (!current) {
        throw fileNotFound();
      }
      if (current.status !== 'pending') {
        throw fileNotReady();
      }
      const result = await kernel.cancelUpload(fileId);
      if (result.outcome === 'missing') {
        throw fileNotFound();
      }
      if (result.outcome === 'ready') {
        throw fileNotReady();
      }
    });
  }

  async enablePublicAccess(
    fileId: string,
    options: PublicAccessOptions = {},
  ): Promise<string> {
    return runDirectService(async () => {
      const access = await this.#state().dataPlane.enablePublicAccess(
        fileId,
        options.disposition ?? 'attachment',
      );
      return access.url;
    });
  }

  async resetPublicAccess(
    fileId: string,
    options: PublicAccessOptions = {},
  ): Promise<string> {
    return runDirectService(async () => {
      const access = await this.#state().dataPlane.resetPublicAccess(
        fileId,
        options.disposition ?? 'attachment',
      );
      return access.url;
    });
  }

  async disablePublicAccess(fileId: string): Promise<void> {
    await runDirectService(async () => {
      await this.#state().dataPlane.disablePublicAccess(fileId);
    });
  }

  #state(): ReturnType<typeof getFilesRuntimeServiceState> {
    return getFilesRuntimeServiceState(this.#runtime);
  }
}

export function createFileService(
  options: CreateFileServiceOptions,
): FileService {
  return new RuntimeFileService(options);
}

async function runDirectService<T>(operation: () => Promise<T>): Promise<T> {
  return operation();
}
