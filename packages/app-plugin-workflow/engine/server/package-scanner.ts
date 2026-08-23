import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';

export interface PackageManifestEntry {
  /** Package relative path using `/` separators. */
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

export interface ScannedPackage {
  readonly key: string;
  readonly root: string;
  readonly entries: readonly PackageManifestEntry[];
}

export interface WorkflowPackageScanOptions {
  maxFiles?: number;
  maxBytes?: number;
}

export class WorkflowPackageScanError extends Error {
  constructor(
    message: string,
    readonly packagePath: string,
  ) {
    super(`${packagePath}: ${message}`);
    this.name = 'WorkflowPackageScanError';
  }
}

interface PackageDescriptor {
  include: string[];
  exclude: string[];
  entries: string[];
}

const EXCLUDED_DIRECTORIES: ReadonlySet<string> = new Set([
  '.git',
  'node_modules',
  '.cache',
  'dist',
  'build',
]);
const SECRET_NAMES: readonly RegExp[] = [
  /^\.env(?:\.|$)/i,
  /secret/i,
  /credentials?/i,
  /\.pem$/i,
  /\.key$/i,
];
const TEMP_NAMES: readonly RegExp[] = [
  /~$/,
  /^\.?#/,
  /\.tmp$/i,
  /\.swp$/i,
  /\.sock$/i,
];

export function assertPackageRelativePath(candidate: string): string {
  if (candidate.includes('\0'))
    throw new WorkflowPackageScanError('path contains NUL', candidate);
  if (path.isAbsolute(candidate) || /^[A-Za-z]:[\\/]/.test(candidate))
    throw new WorkflowPackageScanError(
      'absolute paths are not allowed',
      candidate,
    );
  const normalized = candidate.replaceAll('\\', '/');
  if (normalized.split('/').includes('..'))
    throw new WorkflowPackageScanError(
      'parent traversal is not allowed',
      candidate,
    );
  if (!normalized || normalized === '.')
    throw new WorkflowPackageScanError(
      'empty paths are not allowed',
      candidate,
    );
  return normalized.replace(/^\.\//, '');
}

function excluded(relativePath: string, directory: boolean): boolean {
  const parts = relativePath.split('/');
  if (directory && EXCLUDED_DIRECTORIES.has(parts.at(-1) ?? '')) return true;
  const name = parts.at(-1) ?? '';
  return (
    SECRET_NAMES.some((pattern) => pattern.test(name)) ||
    TEMP_NAMES.some((pattern) => pattern.test(name))
  );
}

function globMatches(pattern: string, candidate: string): boolean {
  const escaped = pattern
    .split('**')
    .map((part) =>
      part
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replaceAll('*', '[^/]*')
        .replaceAll('?', '[^/]'),
    )
    .join('.*');
  return new RegExp(`^${escaped}$`).test(candidate);
}

function stringArray(
  value: unknown,
  field: string,
  descriptorPath: string,
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    throw new WorkflowPackageScanError(
      `${field} must be an array of paths`,
      descriptorPath,
    );
  return value.map((item) => {
    const literal = item.replaceAll('*', 'segment').replaceAll('?', 'q');
    assertPackageRelativePath(literal);
    return item.replaceAll('\\', '/');
  });
}

async function readDescriptor(root: string): Promise<PackageDescriptor> {
  const descriptorPath = path.join(root, 'workflow.package.yaml');
  let document: unknown;
  try {
    document = parse(await fs.readFile(descriptorPath, 'utf8')) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { include: [], exclude: [], entries: [] };
    throw error;
  }
  if (
    document === null ||
    typeof document !== 'object' ||
    Array.isArray(document)
  )
    throw new WorkflowPackageScanError(
      'descriptor must be an object',
      descriptorPath,
    );
  const record = document as Record<string, unknown>;
  const entriesValue = record.entries;
  const entries = Array.isArray(entriesValue)
    ? stringArray(entriesValue, 'entries', descriptorPath)
    : entriesValue && typeof entriesValue === 'object'
      ? stringArray(Object.values(entriesValue), 'entries', descriptorPath)
      : [];
  return {
    include: stringArray(record.include, 'include', descriptorPath),
    exclude: stringArray(record.exclude, 'exclude', descriptorPath),
    entries,
  };
}

export async function scanWorkflowPackage(
  packageRoot: string,
  options: WorkflowPackageScanOptions = {},
): Promise<ScannedPackage> {
  const root = await fs.realpath(path.resolve(packageRoot));
  const rootPrefix = `${root}${path.sep}`;
  const descriptor = await readDescriptor(root);
  const entries: PackageManifestEntry[] = [];
  const seenCaseFolded = new Map<string, string>();
  let totalBytes = 0;
  const maxFiles = options.maxFiles ?? 1_000;
  const maxBytes = options.maxBytes ?? 64 * 1024 * 1024;

  const visit = async (
    directory: string,
    relativeDirectory: string,
  ): Promise<void> => {
    const children = await fs.readdir(directory, { withFileTypes: true });
    for (const child of children.sort((left, right) =>
      Buffer.from(left.name).compare(Buffer.from(right.name)),
    )) {
      const relative = assertPackageRelativePath(
        relativeDirectory ? `${relativeDirectory}/${child.name}` : child.name,
      );
      if (excluded(relative, child.isDirectory())) continue;
      const absolute = path.join(directory, child.name);
      const real = await fs.realpath(absolute);
      if (real !== root && !real.startsWith(rootPrefix))
        throw new WorkflowPackageScanError(
          `symlink escapes package root: ${relative}`,
          root,
        );
      const folded = relative.toLocaleLowerCase('en-US');
      const previous = seenCaseFolded.get(folded);
      if (previous && previous !== relative)
        throw new WorkflowPackageScanError(
          `case-conflicting paths: ${previous} and ${relative}`,
          root,
        );
      seenCaseFolded.set(folded, relative);
      const stat = await fs.stat(absolute);
      if (stat.isDirectory()) {
        await visit(absolute, relative);
      } else if (stat.isFile()) {
        if (
          descriptor.include.length &&
          relative !== 'workflow.package.yaml' &&
          !descriptor.include.some((pattern) => globMatches(pattern, relative))
        )
          continue;
        if (
          descriptor.exclude.some((pattern) => globMatches(pattern, relative))
        )
          continue;
        const content = await fs.readFile(absolute);
        totalBytes += content.byteLength;
        if (entries.length + 1 > maxFiles)
          throw new WorkflowPackageScanError(
            `package exceeds ${maxFiles} files`,
            root,
          );
        if (totalBytes > maxBytes)
          throw new WorkflowPackageScanError(
            `package exceeds ${maxBytes} bytes`,
            root,
          );
        entries.push({
          path: relative,
          size: content.byteLength,
          sha256: createHash('sha256').update(content).digest('hex'),
        });
      } else {
        throw new WorkflowPackageScanError(
          `unsupported filesystem entry: ${relative}`,
          root,
        );
      }
    }
  };
  await visit(root, '');
  for (const entry of descriptor.entries)
    if (!entries.some((file) => file.path === entry))
      throw new WorkflowPackageScanError(
        `declared entry is not included: ${entry}`,
        root,
      );
  if (
    !entries.some(
      (entry) => entry.path === 'workflow.ts' || entry.path === 'workflow.js',
    )
  ) {
    throw new WorkflowPackageScanError(
      'workflow.ts or workflow.js is required',
      root,
    );
  }
  return { key: path.basename(root), root, entries: Object.freeze(entries) };
}
