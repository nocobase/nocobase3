import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';
import { pack, type Header, type Pack } from 'tar-stream';

const EMBEDDED_SERVER_ENTRYPOINT = 'server/embedded.js';
const APP_RELEASE_MANIFEST = 'app-release.json';
const SAFE_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export interface AppPackageManifest {
  name?: string;
  displayName?: string;
  version?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
}

export interface ArtifactFile {
  absolutePath: string;
  /** POSIX path relative to dist, matching App Host's artifact hash contract. */
  relativePath: string;
  size: number;
}

export interface AppReleaseManifest {
  schemaVersion: 1;
  appId: string;
  releaseId: string;
  version: string;
  artifactSha256: string;
  runtime: {
    backend: 'in-process';
    isolation: 'in-process';
    tier: 'warm';
    healthPath: '/api/healthz';
  };
}

export interface ReleasePackageManifest {
  name: string;
  displayName?: string;
  version: string;
  type: 'module';
}

export interface PreparedAppRelease {
  appId: string;
  releaseId: string;
  version: string;
  artifactSha256: string;
  files: ArtifactFile[];
  manifest: AppReleaseManifest;
  packageManifest: ReleasePackageManifest;
}

export function isSafePathSegment(value: string): boolean {
  return SAFE_SEGMENT.test(value) && value !== '.' && value !== '..';
}

export function assertSafePathSegment(value: string, label: string): void {
  if (!isSafePathSegment(value)) {
    throw new Error(
      `${label} must be a safe path segment (letters, numbers, dots, underscores, and hyphens only).`,
    );
  }
}

export function normalizeHubUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `Invalid Hub URL "${value}". Use an absolute http:// or https:// URL.`,
    );
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Hub URL must use http:// or https://.');
  }
  if (url.username || url.password) {
    throw new Error('Hub URL must not contain credentials.');
  }
  if (url.search || url.hash) {
    throw new Error('Hub URL must not contain a query string or fragment.');
  }

  return url.toString().replace(/\/+$/, '');
}

export async function readAppPackageManifest(
  directory: string,
): Promise<AppPackageManifest> {
  const source = path.join(directory, 'package.json');
  let value: unknown;
  try {
    value = JSON.parse(await readFile(source, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(
      `Could not read ${source}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  if (!isRecord(value)) {
    throw new Error(`${source} must contain a JSON object.`);
  }

  return {
    name: optionalString(value.name),
    displayName: optionalString(value.displayName),
    version: optionalString(value.version),
    packageManager: optionalString(value.packageManager),
    scripts: readScripts(value.scripts),
  };
}

export async function prepareAppRelease(options: {
  appId: string;
  appDirectory: string;
  releaseId?: string;
  packageManifest: AppPackageManifest;
}): Promise<PreparedAppRelease> {
  assertSafePathSegment(options.appId, 'App ID');
  const version = options.packageManifest.version?.trim();
  if (!version) {
    throw new Error('package.json must contain a non-empty version to deploy.');
  }

  const distDirectory = path.join(options.appDirectory, 'dist');
  const files = await listArtifactFiles(distDirectory);
  if (!files.some((file) => file.relativePath === EMBEDDED_SERVER_ENTRYPOINT)) {
    throw new Error(
      'The build output is missing dist/server/embedded.js. Run the app build, or fix its build script before deploying.',
    );
  }

  const artifactSha256 = await hashArtifactFiles(files);
  const releaseId =
    options.releaseId ??
    `${safeVersionSegment(version)}-${artifactSha256.slice(0, 12)}`;
  assertSafePathSegment(releaseId, 'Release ID');

  const manifest: AppReleaseManifest = {
    schemaVersion: 1,
    appId: options.appId,
    releaseId,
    version,
    artifactSha256,
    runtime: {
      backend: 'in-process',
      isolation: 'in-process',
      tier: 'warm',
      healthPath: '/api/healthz',
    },
  };
  const packageManifest: ReleasePackageManifest = {
    name: options.appId,
    ...(options.packageManifest.displayName
      ? { displayName: options.packageManifest.displayName }
      : {}),
    version,
    type: 'module',
  };

  return {
    appId: options.appId,
    releaseId,
    version,
    artifactSha256,
    files,
    manifest,
    packageManifest,
  };
}

/**
 * Produces a deterministic gzip stream. Artifact files are read one at a time,
 * so a large client bundle is never assembled in memory by the CLI.
 */
export function createAppReleaseArchive(release: PreparedAppRelease): Readable {
  const archive = pack();
  const gzip = createGzip({ level: 9 });

  void writeArchive(archive, release).catch((error: unknown) => {
    archive.destroy(error instanceof Error ? error : new Error(String(error)));
  });

  return Readable.from(archive as AsyncIterable<Uint8Array>).pipe(gzip);
}

function safeVersionSegment(version: string): string {
  const normalized = version
    .trim()
    .replaceAll(/[^a-zA-Z0-9._-]+/g, '-')
    .replaceAll(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '')
    .slice(0, 115);

  if (!normalized || normalized === '.' || normalized === '..') {
    throw new Error(
      `package.json version "${version}" cannot be converted to a safe Release ID.`,
    );
  }
  return normalized;
}

async function listArtifactFiles(
  rootDirectory: string,
): Promise<ArtifactFile[]> {
  let rootStats: Awaited<ReturnType<typeof lstat>>;
  try {
    rootStats = await lstat(rootDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Build output not found at ${rootDirectory}. Run the app build, or omit --no-build.`,
        { cause: error },
      );
    }
    throw error;
  }

  if (rootStats.isSymbolicLink()) {
    throw new Error('Release dist must not be a symbolic link.');
  }
  if (!rootStats.isDirectory()) {
    throw new Error(`Build output ${rootDirectory} is not a directory.`);
  }

  const files: ArtifactFile[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = (await readdir(directory, { withFileTypes: true })).sort(
      (left, right) => left.name.localeCompare(right.name),
    );

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = toPosixPath(
        path.relative(rootDirectory, absolutePath),
      );

      if (entry.isSymbolicLink()) {
        throw new Error(
          `Release dist must not contain symbolic links: dist/${relativePath}`,
        );
      }
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(
          `Release dist contains an unsupported file type: dist/${relativePath}`,
        );
      }
      if (isEnvironmentFile(relativePath)) {
        continue;
      }

      const stats = await lstat(absolutePath);
      if (stats.isSymbolicLink()) {
        throw new Error(
          `Release dist must not contain symbolic links: dist/${relativePath}`,
        );
      }
      files.push({ absolutePath, relativePath, size: stats.size });
    }
  };

  await visit(rootDirectory);
  return files;
}

function isEnvironmentFile(relativePath: string): boolean {
  const name = path.posix.basename(relativePath);
  return name === '.env' || name.startsWith('.env.');
}

async function hashArtifactFiles(files: ArtifactFile[]): Promise<string> {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update('\0');
    for await (const chunk of createReadStream(
      file.absolutePath,
    ) as AsyncIterable<unknown>) {
      if (!(chunk instanceof Uint8Array)) {
        throw new Error(`Could not read artifact file ${file.relativePath}.`);
      }
      hash.update(chunk);
    }
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function writeArchive(
  archive: Pack,
  release: PreparedAppRelease,
): Promise<void> {
  await writeBufferEntry(
    archive,
    APP_RELEASE_MANIFEST,
    jsonBuffer(release.manifest),
  );
  await writeBufferEntry(
    archive,
    'package.json',
    jsonBuffer(release.packageManifest),
  );

  for (const file of release.files) {
    await writeFileEntry(archive, file);
  }
  archive.finalize();
}

function writeBufferEntry(
  archive: Pack,
  name: string,
  contents: Buffer,
): Promise<void> {
  return new Promise((resolve, reject) => {
    archive.entry(
      normalizedHeader(name, contents.byteLength),
      contents,
      (error?: Error | null) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      },
    );
  });
}

function writeFileEntry(archive: Pack, file: ArtifactFile): Promise<void> {
  return new Promise((resolve, reject) => {
    const input = createReadStream(file.absolutePath);
    const entry = archive.entry(
      normalizedHeader(`dist/${file.relativePath}`, file.size),
      (error?: Error | null) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      },
    );

    input.once('error', reject);
    entry.once('error', reject);
    input.pipe(entry as unknown as NodeJS.WritableStream);
  });
}

function normalizedHeader(name: string, size: number): Header {
  return {
    name,
    size,
    mode: 0o644,
    mtime: new Date(0),
    type: 'file',
    linkname: '',
    uid: 0,
    gid: 0,
    uname: '',
    gname: '',
    devmajor: 0,
    devminor: 0,
  };
}

function jsonBuffer(value: object): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readScripts(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
