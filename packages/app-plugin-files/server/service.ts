import type { Hono } from 'hono';

import type { FilesRuntime } from './runtime.js';
import type { CreateFileRouteOptions, FileService } from './types.js';
import { createFieldFileRoute } from './internal/field-route.js';
import { createRelationFileRoute } from './internal/relation-route.js';
import { invalidFileRoute } from './internal/route-errors.js';
import { getFilesRuntimeServiceState } from './internal/runtime.js';

export interface CreateFileServiceOptions {
  runtime: FilesRuntime;
}

class RuntimeFileService implements FileService {
  readonly #runtime: FilesRuntime;

  constructor(options: CreateFileServiceOptions) {
    this.#runtime = options.runtime;
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
      });
    }
    if (options.binding.type === 'relation') {
      return createRelationFileRoute({
        options,
        binding: options.binding,
        state,
      });
    }
    throw invalidFileRoute('File route binding type is invalid.');
  }
}

export function createFileService(
  options: CreateFileServiceOptions,
): FileService {
  return new RuntimeFileService(options);
}
