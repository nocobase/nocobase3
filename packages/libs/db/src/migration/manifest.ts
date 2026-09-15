import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const marker = '\n// @nocobase/task-manifest v1\n';
const digest = /^[a-f0-9]{64}$/;

interface ManifestEntry {
  sourceChecksum: string;
  artifactChecksum: string;
}

export interface TaskChecksum {
  readonly checksum: string;
  /** Verified hash of the same JavaScript before manifest sealing, for upgrading legacy history. */
  readonly legacyChecksum?: string;
}

export type TaskManifest = ReadonlyMap<string, ManifestEntry>;

/** Reads a directory manifest once and validates every listed artifact before modules are imported. */
export async function readTaskManifest(
  directory: string,
): Promise<TaskManifest | undefined> {
  const filePath = path.join(directory, '.manifest.json');
  let value: unknown;
  try {
    value = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return undefined;
    throw new Error(
      `Cannot read database task manifest ${filePath}. Rebuild the package.`,
      { cause: error },
    );
  }
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.files)) {
    throw new Error(
      `Invalid or unsupported database task manifest ${filePath}. Rebuild the package.`,
    );
  }
  const manifest = new Map<string, ManifestEntry>();
  for (const [name, entry] of Object.entries(value.files)) {
    if (
      !/^[^./\\][^/\\]*\.[cm]?js$/.test(name) ||
      !isRecord(entry) ||
      typeof entry.sourceChecksum !== 'string' ||
      !digest.test(entry.sourceChecksum) ||
      typeof entry.artifactChecksum !== 'string' ||
      !digest.test(entry.artifactChecksum)
    ) {
      throw new Error(
        `Invalid database task manifest entry "${name}" in ${filePath}.`,
      );
    }
    const artifactPath = path.join(directory, name);
    let content: string;
    try {
      content = await readFile(artifactPath, 'utf8');
    } catch (error) {
      throw new Error(
        `Cannot read database task artifact ${artifactPath}. Rebuild the package.`,
        { cause: error },
      );
    }
    if (!content.endsWith(marker) || hash(content) !== entry.artifactChecksum) {
      throw new Error(
        `Database task artifact checksum mismatch: ${path.join(directory, name)}. Rebuild the package.`,
      );
    }
    manifest.set(name, {
      sourceChecksum: entry.sourceChecksum,
      artifactChecksum: entry.artifactChecksum,
    });
  }
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      !entry.name.startsWith('.') &&
      /\.[cm]?js$/.test(entry.name) &&
      !manifest.has(entry.name)
    ) {
      throw new Error(
        `Database task ${entry.name} is missing from ${filePath}. Rebuild the package.`,
      );
    }
  }
  return manifest;
}

export function resolveTaskChecksum(
  filePath: string,
  content: string,
  manifest: TaskManifest | undefined,
): TaskChecksum {
  const entry = manifest?.get(path.basename(filePath));
  if (entry) {
    if (!content.endsWith(marker) || hash(content) !== entry.artifactChecksum) {
      throw new Error(
        `Database task artifact checksum mismatch: ${filePath}. Rebuild the package.`,
      );
    }
    return {
      checksum: entry.sourceChecksum,
      legacyChecksum: hash(content.slice(0, -marker.length)),
    };
  }
  if (content.includes(marker)) {
    throw new Error(
      `Compiled database task ${filePath} requires .manifest.json. Rebuild the package; source fallback is not supported.`,
    );
  }
  return { checksum: hash(content) };
}

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
