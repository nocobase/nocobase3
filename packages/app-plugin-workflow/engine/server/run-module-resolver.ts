import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type {
  WorkflowRunFunction,
  WorkflowRunModule,
  WorkflowRunModuleRequest,
  WorkflowRunModuleResolver,
} from './instructions/run.js';

export class WorkflowRunModuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowRunModuleError';
  }
}

/**
 * The production default.
 *
 * A `run` node that reached the database through a plain API — without a
 * package artifact behind it — must fail at execution time rather than fall
 * back to reading a file off the host (run-node design §9).
 */
export const unboundRunModuleResolver: WorkflowRunModuleResolver = {
  resolve(request: WorkflowRunModuleRequest): Promise<WorkflowRunModule> {
    return Promise.reject(
      new WorkflowRunModuleError(
        `Run node "${request.nodeKey}" has no workflow package artifact bound to it, ` +
          `so its script "${request.sourcePath}" cannot be executed`,
      ),
    );
  },
};

export interface SourceDirResolverOptions {
  /** Directory a `config.script` path is resolved against. */
  rootPath: string;
  /** Set to `false` to disable source execution explicitly. */
  enabled?: boolean;
}

function assertSafeSourcePath(sourcePath: string): void {
  if (sourcePath.includes('\0')) {
    throw new WorkflowRunModuleError(
      'Run script path must not contain a NUL character',
    );
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(sourcePath)) {
    throw new WorkflowRunModuleError(
      `Run script path "${sourcePath}" must not be a URL`,
    );
  }
  if (path.isAbsolute(sourcePath) || /^[a-zA-Z]:[\\/]/.test(sourcePath)) {
    throw new WorkflowRunModuleError(
      `Run script path "${sourcePath}" must not be absolute`,
    );
  }
  if (!sourcePath.startsWith('./') && !sourcePath.startsWith('.\\')) {
    throw new WorkflowRunModuleError(
      `Run script path "${sourcePath}" must be a package-relative path starting with "./"`,
    );
  }
  if (sourcePath.split(/[\\/]/).includes('..')) {
    throw new WorkflowRunModuleError(
      `Run script path "${sourcePath}" must not contain ".."`,
    );
  }
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative.length > 0 &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative)
  );
}

async function realpathOrThrow(
  target: string,
  sourcePath: string,
): Promise<string> {
  try {
    return await fs.realpath(target);
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === 'ENOENT' &&
      target.endsWith('.ts')
    ) {
      try {
        return await fs.realpath(`${target.slice(0, -3)}.js`);
      } catch (compiledError) {
        if ((compiledError as NodeJS.ErrnoException).code !== 'ENOENT')
          throw compiledError;
      }
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new WorkflowRunModuleError(
        `Run script "${sourcePath}" was not found`,
      );
    }
    throw error;
  }
}

function readRunExport(
  loaded: Record<string, unknown>,
  sourcePath: string,
): WorkflowRunFunction {
  const exported = loaded.run;
  if (typeof exported !== 'function') {
    throw new WorkflowRunModuleError(
      `Run script "${sourcePath}" must export a function named "run"`,
    );
  }
  return exported as WorkflowRunFunction;
}

/** Loads a run module from the immutable source revision bound to a workflow hash. */
export function createSourceDirResolver(
  options: SourceDirResolverOptions,
): WorkflowRunModuleResolver {
  const enabled = options.enabled !== false;
  const root = path.resolve(options.rootPath);

  return {
    async resolve(
      request: WorkflowRunModuleRequest,
    ): Promise<WorkflowRunModule> {
      if (!enabled) {
        throw new WorkflowRunModuleError(
          `The source directory resolver is disabled, so run node "${request.nodeKey}" cannot load ` +
            `"${request.sourcePath}".`,
        );
      }
      assertSafeSourcePath(request.sourcePath);

      const target = path.resolve(root, request.sourcePath);
      if (!isInside(root, target)) {
        throw new WorkflowRunModuleError(
          `Run script "${request.sourcePath}" escapes the source root`,
        );
      }
      // Resolve symlinks and check containment again: a link inside the root can
      // still point at a file outside of it.
      const realRoot = await realpathOrThrow(root, request.sourcePath);
      const realTarget = await realpathOrThrow(target, request.sourcePath);
      if (!isInside(realRoot, realTarget)) {
        throw new WorkflowRunModuleError(
          `Run script "${request.sourcePath}" resolves through a symlink that escapes the source root`,
        );
      }

      const loaded: Record<string, unknown> = await import(
        pathToFileURL(realTarget).href
      );
      return { run: readRunExport(loaded, request.sourcePath) };
    },
  };
}
