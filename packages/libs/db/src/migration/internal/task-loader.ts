import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Loading a migration source and loading a seed source differ only in what a
 * definition must contain. Reading the directory, choosing the files,
 * importing a module, and rejecting a duplicate name are the same work, so
 * they live here once and each loader names the kind for its messages.
 */
export type TaskKind = 'Migration' | 'Seed';

export const DEFAULT_TASK_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts'] as const;

export const DEFAULT_TASK_PACKAGE_NAME = 'app';

/** A directory and a source array are two ways to say the same thing. */
export function assertTaskSourceForm(
  kind: TaskKind,
  options: { readonly directory?: unknown; readonly sources?: unknown },
): void {
  if (options.directory !== undefined && options.sources !== undefined) {
    throw new Error(
      `${kind} options cannot define both directory and sources.`,
    );
  }
  if (options.directory === undefined && options.sources === undefined) {
    throw new Error(`${kind} options must define directory or sources.`);
  }
}

export function validateTaskDirectory(
  kind: TaskKind,
  directory: unknown,
): string {
  if (!isNonEmptyString(directory)) {
    throw new Error(`${kind} directory must be a non-empty string.`);
  }
  return directory;
}

export function validateTaskPackageName(
  kind: TaskKind,
  packageName: unknown,
): string {
  if (!isNonEmptyString(packageName)) {
    throw new Error(`${kind} packageName must be a non-empty string.`);
  }
  return packageName;
}

/** A source that does not exist holds no tasks; it is not an error. */
export async function readTaskDirectory(directory: string): Promise<Dirent[]> {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export function isTaskFile(fileName: string, extensions: Set<string>): boolean {
  if (fileName.startsWith('.') || fileName.endsWith('.d.ts')) {
    return false;
  }
  return extensions.has(extname(fileName));
}

export function taskNameFromFileName(fileName: string): string {
  return basename(fileName, extname(fileName));
}

/** The mtime query keeps a re-read after an edit from serving a cached module. */
export async function importTaskDefinition(
  filePath: string,
  mtimeMs: number,
): Promise<unknown> {
  const url = pathToFileURL(filePath);
  url.searchParams.set('mtime', String(Math.trunc(mtimeMs)));
  const module = await import(url.href);
  return (module as { default?: unknown }).default;
}

export function validateUniqueTaskNames(
  kind: TaskKind,
  tasks: readonly { readonly name: string; readonly filePath: string }[],
): void {
  const seen = new Map<string, { readonly filePath: string }>();
  for (const task of tasks) {
    const previous = seen.get(task.name);
    if (previous) {
      throw new Error(
        `Duplicate ${kind.toLowerCase()} name "${task.name}" in ${previous.filePath} and ${task.filePath}.`,
      );
    }
    seen.set(task.name, task);
  }
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isValidTransactionMode(value: unknown): boolean {
  return (
    value === undefined || value === true || value === false || value === 'auto'
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
