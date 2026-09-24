import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

const marker = '\n// @nocobase/task-manifest v1\n';
const sourceExtensions = new Map([
  ['.ts', '.js'],
  ['.mts', '.mjs'],
  ['.cts', '.cjs'],
  ['.js', '.js'],
  ['.mjs', '.mjs'],
  ['.cjs', '.cjs'],
]);

export interface DatabaseManifestBuildOptions {
  /** Source database tree, including connection-specific subdirectories. */
  readonly sourceDir: string;
  /** Corresponding compiled database tree, after all JavaScript rewriting. */
  readonly outputDir: string;
}

interface ManifestEntry {
  sourceChecksum: string;
  artifactChecksum: string;
}

/** Seals compiled migration and seed directories with their source identities. */
export async function generateDatabaseManifests(
  options: DatabaseManifestBuildOptions,
): Promise<void> {
  const sourceDir = path.resolve(options.sourceDir);
  const outputDir = path.resolve(options.outputDir);
  if (
    containsDirectory(sourceDir, outputDir) ||
    containsDirectory(outputDir, sourceDir)
  )
    throw new Error(
      'Database manifest source and output directories must not overlap.',
    );
  await visit(sourceDir, outputDir);
}

async function visit(sourceDir: string, outputDir: string): Promise<void> {
  const entries = await readDirectory(sourceDir);
  const outputEntries = await readDirectory(outputDir);
  if (!entries.length && !outputEntries.length) return;
  if (['migrations', 'seeds'].includes(path.basename(sourceDir))) {
    await sealDirectory(
      sourceDir,
      outputDir,
      entries.filter((entry) => entry.isFile()).map((entry) => entry.name),
    );
    return;
  }
  const directories = new Set(
    [...entries, ...outputEntries]
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name),
  );
  for (const name of [...directories].sort()) {
    await visit(path.join(sourceDir, name), path.join(outputDir, name));
  }
}

async function readDirectory(directory: string): Promise<Dirent[]> {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

async function sealDirectory(
  sourceDir: string,
  outputDir: string,
  names: string[],
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const previous = await readPreviousManifest(outputDir);
  const files: Record<string, ManifestEntry> = {};
  const writes: { filePath: string; content: string }[] = [];
  for (const name of names.sort()) {
    if (name.startsWith('.') || /\.d\.[cm]?ts$/.test(name)) continue;
    const extension = sourceExtensions.get(path.extname(name));
    if (!extension) continue;
    const outputName = path.basename(name, path.extname(name)) + extension;
    if (files[outputName])
      throw new Error(`Multiple database task sources produce ${outputName}.`);
    const sourcePath = path.join(sourceDir, name);
    const outputPath = path.join(outputDir, outputName);
    const source = await readFile(sourcePath, 'utf8');
    let artifact: string;
    try {
      artifact = await readFile(outputPath, 'utf8');
    } catch (error) {
      if (isMissing(error))
        throw new Error(
          `Missing compiled database task ${outputPath}. Compile it before generating manifests.`,
          { cause: error },
        );
      throw error;
    }
    if ((await stat(sourcePath)).mtimeMs > (await stat(outputPath)).mtimeMs) {
      throw new Error(
        `Database task source ${sourcePath} is newer than its compiled output. Rebuild before generating manifests.`,
      );
    }
    if (
      artifact.includes(marker) &&
      (!artifact.endsWith(marker) ||
        previous?.[outputName]?.sourceChecksum !== hash(source) ||
        previous[outputName]?.artifactChecksum !== hash(artifact))
    ) {
      throw new Error(
        `Previously sealed database task ${outputPath} no longer matches its source and manifest. Rebuild before generating manifests.`,
      );
    }
    const sealed = artifact.endsWith(marker) ? artifact : artifact + marker;
    files[outputName] = {
      sourceChecksum: hash(source),
      artifactChecksum: hash(sealed),
    };
    writes.push({ filePath: outputPath, content: sealed });
  }
  for (const entry of await readdir(outputDir, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      !entry.name.startsWith('.') &&
      /\.[cm]?js$/.test(entry.name) &&
      !Object.hasOwn(files, entry.name)
    ) {
      throw new Error(
        `Compiled database task ${path.join(outputDir, entry.name)} has no source. Clean and rebuild the output.`,
      );
    }
  }
  for (const write of writes) await writeFile(write.filePath, write.content);
  const manifestPath = path.join(outputDir, '.manifest.json');
  const temporaryPath = `${manifestPath}.${process.pid}.tmp`;
  await writeFile(
    temporaryPath,
    JSON.stringify({ version: 1, files }, null, 2) + '\n',
  );
  await rename(temporaryPath, manifestPath);
}

async function readPreviousManifest(
  directory: string,
): Promise<Record<string, ManifestEntry> | undefined> {
  try {
    const value: unknown = JSON.parse(
      await readFile(path.join(directory, '.manifest.json'), 'utf8'),
    );
    if (
      value &&
      typeof value === 'object' &&
      'version' in value &&
      value.version === 1 &&
      'files' in value &&
      value.files &&
      typeof value.files === 'object'
    ) {
      return value.files as Record<string, ManifestEntry>;
    }
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  return undefined;
}

function containsDirectory(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
