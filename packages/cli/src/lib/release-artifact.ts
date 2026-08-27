import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

const ARTIFACT_DIGEST_PREFIX = Buffer.from(
  'nocobase-release-artifact-v1\0',
  'utf8',
);

export interface ReleaseManifest {
  readonly [key: string]: unknown;
  readonly schemaVersion: 1;
  readonly basePath: string;
  readonly client: { readonly rootDir: 'dist/client' };
  readonly server: {
    readonly entrypoint: 'dist/server/embedded.js';
    readonly healthPath: '/api/healthz';
  };
}

export interface BuildReleaseArtifactOptions {
  readonly applicationSlug: string;
  readonly buildDirectory: string;
  readonly outputPath: string;
}

export interface BuiltReleaseArtifact {
  readonly path: string;
  readonly manifest: ReleaseManifest;
  readonly checksum: string;
  readonly sizeBytes: number;
  readonly archiveChecksum: string;
  readonly archiveSizeBytes: number;
  readonly archiveFormat: 'tar.gz';
}

export type LocalReleaseArtifactErrorCode =
  | 'LOCAL_RELEASE_BUILD_MISSING'
  | 'LOCAL_RELEASE_INVALID_INPUT'
  | 'LOCAL_RELEASE_OUTPUT_FAILED'
  | 'LOCAL_RELEASE_PATH_TOO_LONG'
  | 'LOCAL_RELEASE_UNSUPPORTED_ENTRY';

export class LocalReleaseArtifactError extends Error {
  readonly code: LocalReleaseArtifactErrorCode;

  constructor(
    code: LocalReleaseArtifactErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = 'LocalReleaseArtifactError';
    this.code = code;
  }
}

export async function buildReleaseArtifact(
  options: BuildReleaseArtifactOptions,
): Promise<BuiltReleaseArtifact> {
  const applicationSlug = normalizeSlug(options.applicationSlug);
  const buildDirectory = path.resolve(options.buildDirectory);
  await assertRealDirectory(buildDirectory);
  const outputPath = path.resolve(options.outputPath);
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'nb3-release-artifact-'),
  );

  try {
    const stagingDirectory = path.join(temporaryRoot, 'staging');
    await copyRegularTree(buildDirectory, path.join(stagingDirectory, 'dist'));
    const manifest: ReleaseManifest = {
      schemaVersion: 1,
      basePath: `/${applicationSlug}`,
      client: { rootDir: 'dist/client' },
      server: {
        entrypoint: 'dist/server/embedded.js',
        healthPath: '/api/healthz',
      },
    };
    await writeFile(
      path.join(stagingDirectory, 'nocobase-release.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { mode: 0o644 },
    );
    await assertRequiredFile(
      path.join(stagingDirectory, 'dist/server/embedded.js'),
    );

    const files = await listRegularFiles(stagingDirectory);
    const checksum = await computeChecksumForFiles(stagingDirectory, files);
    const sizeBytes = await totalFileSize(stagingDirectory, files);
    const archive = await writeArchiveAtomically(
      outputPath,
      stagingDirectory,
      files,
    );
    return {
      path: outputPath,
      manifest,
      checksum,
      sizeBytes,
      archiveChecksum: archive.checksum,
      archiveSizeBytes: archive.sizeBytes,
      archiveFormat: 'tar.gz',
    };
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

export async function computeReleaseArtifactChecksum(
  releaseDirectory: string,
): Promise<string> {
  const root = path.resolve(releaseDirectory);
  await assertRealDirectory(root);
  return computeChecksumForFiles(root, await listRegularFiles(root));
}

async function copyRegularTree(
  source: string,
  destination: string,
): Promise<void> {
  await mkdir(destination, { recursive: true, mode: 0o755 });
  const entries = await readdir(source, { withFileTypes: true });
  entries.sort((left, right) => compareUtf8(left.name, right.name));
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (isEnvironmentFile(entry.name)) continue;
    const entryStat = await lstat(sourcePath);
    if (entryStat.isSymbolicLink()) {
      throw unsupportedEntry(entry.name, 'symbolic link');
    }
    if (entryStat.isDirectory()) {
      await copyRegularTree(sourcePath, destinationPath);
      continue;
    }
    if (!entryStat.isFile()) {
      throw unsupportedEntry(entry.name, 'special file');
    }
    await copyFile(sourcePath, destinationPath);
    await chmod(destinationPath, entryStat.mode & 0o111 ? 0o755 : 0o644);
  }
}

async function listRegularFiles(
  root: string,
  directory: string = root,
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relative = relativePath(root, absolutePath);
    const entryStat = await lstat(absolutePath);
    if (entryStat.isSymbolicLink()) {
      throw unsupportedEntry(relative, 'symbolic link');
    }
    if (entryStat.isDirectory()) {
      files.push(...(await listRegularFiles(root, absolutePath)));
      continue;
    }
    if (!entryStat.isFile()) throw unsupportedEntry(relative, 'special file');
    files.push(relative);
  }
  return files.sort(compareUtf8);
}

async function computeChecksumForFiles(
  root: string,
  files: readonly string[],
): Promise<string> {
  const digest = createHash('sha256');
  digest.update(ARTIFACT_DIGEST_PREFIX);
  for (const relative of files) {
    const absolutePath = path.join(root, ...relative.split('/'));
    const file = await hashRegularFile(absolutePath);
    const size = Buffer.alloc(8);
    size.writeBigUInt64BE(BigInt(file.size));
    digest.update(Buffer.from(relative, 'utf8'));
    digest.update(Buffer.from([0]));
    digest.update(size);
    digest.update(file.digest);
    digest.update(Buffer.from([0]));
  }
  return `sha256:${digest.digest('hex')}`;
}

async function hashRegularFile(
  filePath: string,
): Promise<{ digest: Buffer; size: number }> {
  const before = await lstat(filePath);
  if (!before.isFile() || before.isSymbolicLink()) {
    throw unsupportedEntry(filePath, 'non-regular file');
  }
  const digest = createHash('sha256');
  let size = 0;
  for await (const chunk of createReadStream(filePath)) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    digest.update(bytes);
  }
  if (size !== before.size) {
    throw new LocalReleaseArtifactError(
      'LOCAL_RELEASE_OUTPUT_FAILED',
      `Release file "${filePath}" changed while it was read.`,
    );
  }
  return { digest: digest.digest(), size };
}

async function totalFileSize(
  root: string,
  files: readonly string[],
): Promise<number> {
  let total = 0;
  for (const relative of files) {
    total += (await lstat(path.join(root, ...relative.split('/')))).size;
  }
  return total;
}

async function* createTar(
  root: string,
  files: readonly string[],
): AsyncGenerator<Buffer, void, undefined> {
  for (const relative of files) {
    const filePath = path.join(root, ...relative.split('/'));
    const fileSize = (await lstat(filePath)).size;
    const header = Buffer.alloc(512);
    const { name, prefix } = splitTarPath(relative);
    writeString(header, 0, 100, name);
    writeOctal(header, 100, 8, 0o644);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, fileSize);
    writeOctal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header[156] = '0'.charCodeAt(0);
    writeString(header, 257, 6, 'ustar');
    writeString(header, 263, 2, '00');
    writeString(header, 265, 32, 'nocobase');
    writeString(header, 297, 32, 'nocobase');
    writeString(header, 345, 155, prefix);
    writeChecksum(
      header,
      header.reduce((sum, byte) => sum + byte, 0),
    );
    yield header;
    for await (const chunk of createReadStream(filePath)) {
      yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    }
    const padding = (512 - (fileSize % 512)) % 512;
    if (padding) yield Buffer.alloc(padding);
  }
  yield Buffer.alloc(1024);
}

async function writeArchiveAtomically(
  outputPath: string,
  root: string,
  files: readonly string[],
): Promise<{ readonly checksum: string; readonly sizeBytes: number }> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp-${process.pid}-${randomUUID()}`;
  const digest = createHash('sha256');
  let sizeBytes = 0;
  const inspectArchive = new Transform({
    transform(
      chunk: Buffer,
      _encoding: BufferEncoding,
      callback: TransformCallback,
    ): void {
      sizeBytes += chunk.byteLength;
      digest.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.from(createTar(root, files)),
      createGzip({ level: 9 }),
      inspectArchive,
      createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 }),
    );
    await rename(temporaryPath, outputPath);
    await chmod(outputPath, 0o600);
    return { checksum: `sha256:${digest.digest('hex')}`, sizeBytes };
  } catch (error) {
    throw new LocalReleaseArtifactError(
      'LOCAL_RELEASE_OUTPUT_FAILED',
      `Release archive "${outputPath}" could not be written.`,
      error,
    );
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function splitTarPath(relative: string): { name: string; prefix: string } {
  if (Buffer.byteLength(relative) <= 100) return { name: relative, prefix: '' };
  const segments = relative.split('/');
  for (let index = segments.length - 1; index > 0; index -= 1) {
    const prefix = segments.slice(0, index).join('/');
    const name = segments.slice(index).join('/');
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) {
      return { name, prefix };
    }
  }
  throw new LocalReleaseArtifactError(
    'LOCAL_RELEASE_PATH_TOO_LONG',
    `Release path is too long for ustar: ${relative}`,
  );
}

function writeString(
  buffer: Buffer,
  offset: number,
  length: number,
  value: string,
): void {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.byteLength > length) {
    throw new LocalReleaseArtifactError(
      'LOCAL_RELEASE_PATH_TOO_LONG',
      `Tar field is too long: ${value}`,
    );
  }
  bytes.copy(buffer, offset);
}

function writeOctal(
  buffer: Buffer,
  offset: number,
  length: number,
  value: number,
): void {
  writeString(
    buffer,
    offset,
    length,
    `${value.toString(8).padStart(length - 1, '0')}\0`,
  );
}

function writeChecksum(buffer: Buffer, value: number): void {
  writeString(buffer, 148, 8, `${value.toString(8).padStart(6, '0')}\0 `);
}

async function assertRealDirectory(directory: string): Promise<void> {
  try {
    const directoryStat = await lstat(directory);
    if (directoryStat.isDirectory() && !directoryStat.isSymbolicLink()) return;
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  throw new LocalReleaseArtifactError(
    'LOCAL_RELEASE_BUILD_MISSING',
    `Build directory "${directory}" is missing or invalid. Build the app before publishing it.`,
  );
}

async function assertRequiredFile(filePath: string): Promise<void> {
  try {
    const file = await lstat(filePath);
    if (file.isFile() && !file.isSymbolicLink()) return;
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  throw new LocalReleaseArtifactError(
    'LOCAL_RELEASE_BUILD_MISSING',
    'Build output must contain server/embedded.js before it can be published.',
  );
}

function normalizeSlug(value: string): string {
  const slug = requireText(value, 'application slug');
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    throw new LocalReleaseArtifactError(
      'LOCAL_RELEASE_INVALID_INPUT',
      'Application slug must contain lowercase letters, numbers, and single hyphens.',
    );
  }
  return slug;
}

function requireText(value: string, label: string): string {
  const text = value.trim();
  if (!text) {
    throw new LocalReleaseArtifactError(
      'LOCAL_RELEASE_INVALID_INPUT',
      `${label} is required.`,
    );
  }
  return text;
}

function unsupportedEntry(
  relative: string,
  type: string,
): LocalReleaseArtifactError {
  return new LocalReleaseArtifactError(
    'LOCAL_RELEASE_UNSUPPORTED_ENTRY',
    `Build output contains unsupported ${type} "${relative}".`,
  );
}

function isEnvironmentFile(relative: string): boolean {
  const basename = path.posix.basename(relative.split(path.sep).join('/'));
  return basename === '.env' || basename.startsWith('.env.');
}

function relativePath(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join('/');
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}
