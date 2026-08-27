import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  chmod,
  writeFile,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const PROTECTED_PATH_NAMES: ReadonlySet<string> = new Set([
  '.git',
  '.nb3',
  '.nocobase',
  'node_modules',
]);
const IGNORED_ROOT_NAMES: ReadonlySet<string> = new Set([
  'coverage',
  'dist',
  'dist-ssr',
  'playwright-report',
  'storage',
  'test-results',
]);

interface SourceEntry {
  readonly mode: number;
  readonly relativePath: string;
  readonly contents: Buffer;
}

export interface MirrorSourceTreeOptions {
  /** Removes snapshot-excluded files already present in a temporary Hub clone before committing the new snapshot. */
  readonly purgeExcludedFromTarget?: boolean;
}

/**
 * Compares only source-controlled application files. Dependencies, build output, secrets, runtime storage, Git data,
 * and local Hub association state are deliberately outside the snapshot contract.
 */
export async function sourceTreesEqual(
  leftDirectory: string,
  rightDirectory: string,
): Promise<boolean> {
  const [left, right] = await Promise.all([
    readSourceEntries(leftDirectory),
    readSourceEntries(rightDirectory),
  ]);

  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    const leftEntry = left[index];
    const rightEntry = right[index];
    if (
      !leftEntry ||
      !rightEntry ||
      leftEntry.relativePath !== rightEntry.relativePath ||
      executableMode(leftEntry.mode) !== executableMode(rightEntry.mode)
    ) {
      return false;
    }
    if (!leftEntry.contents.equals(rightEntry.contents)) return false;
  }

  return true;
}

/**
 * Makes the target's source snapshot match the source. Target-local dependencies, build output, secrets, runtime
 * storage, Git data, and Hub association state remain untouched.
 */
export async function mirrorSourceTree(
  sourceDirectory: string,
  targetDirectory: string,
  options: MirrorSourceTreeOptions = {},
): Promise<void> {
  const sourceRoot = path.resolve(sourceDirectory);
  const targetRoot = path.resolve(targetDirectory);
  const sourceEntries = await readSourceEntries(sourceRoot);
  if (options.purgeExcludedFromTarget) {
    await purgeExcludedPaths(targetRoot, targetRoot);
  }
  const sourcePaths = new Set(sourceEntries.map((entry) => entry.relativePath));
  const targetEntries = await readSourceEntries(targetRoot);
  await assertWritableTargetPaths(targetRoot, [
    ...sourceEntries,
    ...targetEntries,
  ]);

  try {
    await applySourceEntries(targetRoot, sourceEntries, sourcePaths);
  } catch (error) {
    try {
      await applySourceEntries(
        targetRoot,
        targetEntries,
        new Set(targetEntries.map((entry) => entry.relativePath)),
      );
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        `Could not apply the source snapshot or fully restore ${targetRoot}.`,
        { cause: rollbackError },
      );
    }
    throw error;
  }
}

async function assertWritableTargetPaths(
  targetRoot: string,
  entries: readonly SourceEntry[],
): Promise<void> {
  const directories = new Set(
    entries.map((entry) =>
      path.dirname(path.join(targetRoot, entry.relativePath)),
    ),
  );
  directories.add(targetRoot);

  for (const directory of directories) {
    await access(await nearestExistingDirectory(directory), constants.W_OK);
  }
}

async function nearestExistingDirectory(directory: string): Promise<string> {
  let current = directory;
  for (;;) {
    try {
      const metadata = await lstat(current);
      if (metadata.isDirectory()) return current;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
}

async function applySourceEntries(
  targetRoot: string,
  sourceEntries: readonly SourceEntry[],
  sourcePaths: ReadonlySet<string>,
): Promise<void> {
  const targetEntries = await readSourceEntries(targetRoot);

  for (const entry of [...targetEntries].reverse()) {
    if (sourcePaths.has(entry.relativePath)) continue;
    await rm(path.join(targetRoot, entry.relativePath), {
      force: true,
      recursive: true,
    });
  }

  for (const entry of sourceEntries) {
    const target = path.join(targetRoot, entry.relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await rm(target, { force: true, recursive: true });
    await writeFile(target, entry.contents);
    await chmod(target, entry.mode & 0o777);
  }

  await removeEmptySourceDirectories(targetRoot, targetRoot);
}

async function readSourceEntries(directory: string): Promise<SourceEntry[]> {
  const root = path.resolve(directory);
  const entries: SourceEntry[] = [];
  await collectSourceEntries(root, root, entries);
  return entries.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

async function collectSourceEntries(
  root: string,
  directory: string,
  entries: SourceEntry[],
): Promise<void> {
  let children;
  try {
    children = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }

  for (const child of children) {
    const absolute = path.join(directory, child.name);
    const relative = toPosixPath(path.relative(root, absolute));
    if (isIgnored(relative, child.isDirectory())) continue;

    if (child.isDirectory()) {
      await collectSourceEntries(root, absolute, entries);
      continue;
    }

    const metadata = await lstat(absolute);
    if (metadata.isSymbolicLink())
      throw new Error(
        `Source snapshots do not support symbolic links: ${relative}`,
      );
    if (metadata.isFile()) {
      entries.push({
        mode: metadata.mode,
        relativePath: relative,
        contents: await readFile(absolute),
      });
    }
  }
}

function isIgnored(relativePath: string, _directory: boolean): boolean {
  const segments = relativePath.split('/');
  const name = segments.at(-1) ?? '';
  if (segments.some((segment) => PROTECTED_PATH_NAMES.has(segment))) {
    return true;
  }
  if (segments.length === 1 && IGNORED_ROOT_NAMES.has(name)) return true;
  if (name === '.npmrc') return true;
  return name.startsWith('.env') && !name.endsWith('.example');
}

async function removeEmptySourceDirectories(
  root: string,
  directory: string,
): Promise<boolean> {
  let children;
  try {
    children = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }

  for (const child of children) {
    if (!child.isDirectory()) continue;
    const absolute = path.join(directory, child.name);
    const relative = toPosixPath(path.relative(root, absolute));
    if (isIgnored(relative, true)) continue;
    if (await removeEmptySourceDirectories(root, absolute)) {
      await rm(absolute, { force: true, recursive: true });
    }
  }

  const remaining = await readdir(directory);
  return directory !== root && remaining.length === 0;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function executableMode(mode: number): number {
  return mode & 0o111;
}

async function purgeExcludedPaths(
  root: string,
  directory: string,
): Promise<void> {
  let children;
  try {
    children = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  for (const child of children) {
    const absolute = path.join(directory, child.name);
    const relative = toPosixPath(path.relative(root, absolute));
    if (relative === '.git') continue;
    if (isIgnored(relative, child.isDirectory())) {
      await rm(absolute, { force: true, recursive: true });
      continue;
    }
    if (child.isDirectory()) await purgeExcludedPaths(root, absolute);
  }
}
