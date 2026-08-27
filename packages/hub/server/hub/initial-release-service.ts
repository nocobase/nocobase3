import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  ReleaseUploadActor,
  ReleaseUploadCreateInput,
} from './release-upload-service.ts';
import { ReleaseUploadService } from './release-upload-service.ts';
import { HubDomainError, HubStore } from './store.ts';
import type { HubRelease } from './types.ts';

const CHECKSUM_FIELD_OFFSET = 148;
const TAR_BLOCK_BYTES = 512;
const TAR_END_BYTES = TAR_BLOCK_BYTES * 2;

interface DefaultResourceMetadata {
  readonly schemaVersion: 1;
  readonly release: {
    readonly version: string;
    readonly archiveFormat: 'tar.gz';
  };
}

export interface InitialReleaseServiceOptions {
  readonly resourcesDirectory: string;
  readonly uploads: ReleaseUploadService;
  readonly store: HubStore;
}

export interface CreateInitialReleaseInput {
  readonly applicationId: string;
  readonly slug: string;
  readonly actor: ReleaseUploadActor;
}

/** Creates a verified, undeployed Release from the packaged default template. */
export class InitialReleaseService {
  private readonly resourcesDirectory: string;

  constructor(private readonly options: InitialReleaseServiceOptions) {
    this.resourcesDirectory = path.resolve(options.resourcesDirectory);
  }

  async create(input: CreateInitialReleaseInput): Promise<HubRelease> {
    const existing = await this.options.store.listReleases(
      input.applicationId,
      { limit: 1 },
    );
    if (existing.items[0]) return existing.items[0];

    const metadata = await this.readMetadata();
    const sourceArchive = new Uint8Array(
      await readFile(
        path.join(this.resourcesDirectory, 'initial-release.tar.gz'),
      ),
    );
    const prepared = prepareInitialReleaseArchive({
      archive: sourceArchive,
      slug: input.slug,
    });
    const createInput: ReleaseUploadCreateInput = {
      version: metadata.release.version,
      checksum: prepared.checksum,
      sizeBytes: prepared.sizeBytes,
      archiveChecksum: sha256(prepared.archive),
      archiveSizeBytes: prepared.archive.byteLength,
      archiveFormat: metadata.release.archiveFormat,
      manifest: prepared.manifest,
    };
    const upload = await this.options.uploads.create(
      input.applicationId,
      createInput,
      input.actor,
    );
    await this.options.uploads.putContent(
      upload.id,
      input.actor,
      prepared.archive,
    );
    await this.options.uploads.startCompletion(upload.id, input.actor);
    const completed = await this.options.uploads.waitForCompletion(upload.id);
    if (completed.status !== 'completed' || !completed.release) {
      await this.options.uploads
        .cancel(upload.id, input.actor)
        .catch(() => undefined);
      throw new HubDomainError(
        completed.failure?.code ?? 'INITIAL_RELEASE_VERIFICATION_FAILED',
        completed.failure?.message ??
          'The initial application release could not be verified.',
        { status: 422, retryable: false },
      );
    }
    const release = await this.options.store.getRelease(completed.release.id);
    if (!release) {
      throw new HubDomainError(
        'INITIAL_RELEASE_NOT_FOUND',
        'The verified initial release could not be loaded.',
        { status: 500, retryable: true },
      );
    }
    return release;
  }

  private async readMetadata(): Promise<DefaultResourceMetadata> {
    try {
      const value = JSON.parse(
        await readFile(
          path.join(this.resourcesDirectory, 'metadata.json'),
          'utf8',
        ),
      ) as Partial<DefaultResourceMetadata>;
      if (
        value.schemaVersion !== 1 ||
        value.release?.archiveFormat !== 'tar.gz' ||
        typeof value.release.version !== 'string'
      ) {
        throw new Error('invalid resource metadata');
      }
      return value as DefaultResourceMetadata;
    } catch (error) {
      throw new HubDomainError(
        'DEFAULT_APP_RESOURCES_INVALID',
        'Default application resources are invalid.',
        { status: 500, retryable: false, cause: error },
      );
    }
  }
}

interface PreparedInitialRelease {
  readonly archive: Uint8Array;
  readonly checksum: string;
  readonly sizeBytes: number;
  readonly manifest: Record<string, unknown>;
}

function prepareInitialReleaseArchive(input: {
  readonly archive: Uint8Array;
  readonly slug: string;
}): PreparedInitialRelease {
  const targetBasePath = `/${input.slug}`;
  let files: TarFile[];
  try {
    files = parseTarFiles(gunzipSync(input.archive));
  } catch (error) {
    if (error instanceof HubDomainError) throw error;
    throw new HubDomainError(
      'DEFAULT_APP_RESOURCES_INVALID',
      'The packaged initial release archive is invalid.',
      { status: 500, retryable: false, cause: error },
    );
  }
  const manifestFile = files.find(
    (file) => file.path === 'nocobase-release.json',
  );
  if (!manifestFile) {
    throw new HubDomainError(
      'RELEASE_MANIFEST_MISSING',
      'The packaged initial release manifest is missing.',
      { status: 500, retryable: false },
    );
  }
  const manifest = parseManifest(manifestFile.content);
  const sourceBasePath =
    typeof manifest.basePath === 'string' ? manifest.basePath : undefined;
  if (!sourceBasePath || sourceBasePath === '/') throw invalidArchive();
  manifest.basePath = targetBasePath;
  manifestFile.content = Buffer.from(
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  for (const file of files) {
    if (!isClientTextAsset(file.path)) continue;
    file.content = Buffer.from(
      replaceApplicationBasePath(
        file.content.toString('utf8'),
        sourceBasePath,
        targetBasePath,
      ),
      'utf8',
    );
  }

  const tar = createTar(files);
  const archive = gzipSync(tar, { level: 9 });
  return {
    archive,
    checksum: computeChecksum(files),
    sizeBytes: files.reduce(
      (total, file) => total + file.content.byteLength,
      0,
    ),
    manifest,
  };
}

interface TarFile {
  path: string;
  content: Buffer;
}

function parseTarFiles(tar: Uint8Array): TarFile[] {
  const files: TarFile[] = [];
  let offset = 0;
  let pendingLongName: string | undefined;
  while (offset + TAR_BLOCK_BYTES <= tar.byteLength) {
    const header = tar.subarray(offset, offset + TAR_BLOCK_BYTES);
    offset += TAR_BLOCK_BYTES;
    if (header.every((byte) => byte === 0)) break;
    const name = pendingLongName ?? readTarString(header, 0, 100);
    pendingLongName = undefined;
    const prefix = readTarString(header, 345, 155);
    const fullName = prefix && !name.includes('/') ? `${prefix}/${name}` : name;
    const size = readTarNumber(header, 124, 12);
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      offset + paddedSize(size) > tar.byteLength
    ) {
      throw invalidArchive();
    }
    const type = String.fromCharCode(header[156] || 48);
    if (fullName === '././@LongLink' || type === 'L') {
      pendingLongName = Buffer.from(tar.subarray(offset, offset + size))
        .toString('utf8')
        .replace(/\0.*$/, '');
      offset += paddedSize(size);
      continue;
    }
    if (fullName === 'PaxHeaders.0' || type === 'x' || type === 'g') {
      offset += paddedSize(size);
      continue;
    }
    const normalized = normalizeArchivePath(fullName);
    if (type !== '0' && type !== '\0' && type !== '5') {
      throw invalidArchive();
    }
    if (type !== '5') {
      files.push({
        path: normalized,
        content: Buffer.from(tar.subarray(offset, offset + size)),
      });
    }
    offset += paddedSize(size);
  }
  return files;
}

function createTar(files: readonly TarFile[]): Buffer {
  const blocks: Buffer[] = [];
  for (const file of [...files].sort((left, right) =>
    Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)),
  )) {
    const header = Buffer.alloc(TAR_BLOCK_BYTES);
    const { name, prefix } = splitTarPath(file.path);
    writeString(header, 0, 100, name);
    writeOctal(header, 100, 8, 0o644);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, file.content.byteLength);
    writeOctal(header, 136, 12, 0);
    header.fill(0x20, CHECKSUM_FIELD_OFFSET, CHECKSUM_FIELD_OFFSET + 8);
    header[156] = '0'.charCodeAt(0);
    writeString(header, 257, 6, 'ustar');
    writeString(header, 263, 2, '00');
    writeString(header, 265, 32, 'nocobase');
    writeString(header, 297, 32, 'nocobase');
    writeString(header, 345, 155, prefix);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    writeString(
      header,
      CHECKSUM_FIELD_OFFSET,
      8,
      `${checksum.toString(8).padStart(6, '0')}\0 `,
    );
    blocks.push(header, file.content);
    const padding =
      paddedSize(file.content.byteLength) - file.content.byteLength;
    if (padding) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(TAR_END_BYTES));
  return Buffer.concat(blocks);
}

function computeChecksum(files: readonly TarFile[]): string {
  const digest = createHash('sha256');
  digest.update(Buffer.from('nocobase-release-artifact-v1\0', 'utf8'));
  for (const file of [...files].sort((left, right) =>
    Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)),
  )) {
    const size = Buffer.alloc(8);
    size.writeBigUInt64BE(BigInt(file.content.byteLength));
    digest.update(Buffer.from(file.path, 'utf8'));
    digest.update(Buffer.from([0]));
    digest.update(size);
    digest.update(createHash('sha256').update(file.content).digest());
    digest.update(Buffer.from([0]));
  }
  return `sha256:${digest.digest('hex')}`;
}

function replaceApplicationBasePath(
  value: string,
  sourceBasePath: string,
  targetBasePath: string,
): string {
  return value.replaceAll(`${sourceBasePath}/`, `${targetBasePath}/`);
}

function isClientTextAsset(filePath: string): boolean {
  return (
    filePath.startsWith('dist/client/') &&
    ['.css', '.html', '.js', '.mjs'].some((extension) =>
      filePath.endsWith(extension),
    )
  );
}

function parseManifest(content: Uint8Array): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(Buffer.from(content).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('not object');
    }
    return value as Record<string, unknown>;
  } catch (error) {
    throw new HubDomainError(
      'RELEASE_MANIFEST_INVALID',
      'The packaged initial release manifest is invalid.',
      { status: 500, retryable: false, cause: error },
    );
  }
}

function readTarString(
  bytes: Uint8Array,
  offset: number,
  length: number,
): string {
  return Buffer.from(bytes.subarray(offset, offset + length))
    .toString('utf8')
    .replace(/\0.*$/, '');
}

function readTarNumber(
  bytes: Uint8Array,
  offset: number,
  length: number,
): number {
  const value = readTarString(bytes, offset, length).trim();
  if (!value) return 0;
  if (!/^[0-7]+$/.test(value)) return Number.NaN;
  return Number.parseInt(value, 8);
}

function paddedSize(size: number): number {
  return Math.ceil(size / TAR_BLOCK_BYTES) * TAR_BLOCK_BYTES;
}

function normalizeArchivePath(value: string): string {
  const normalized = value.replace(/^\.\//, '');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    normalized.includes('\\') ||
    normalized.split('/').some((segment) => segment === '..')
  ) {
    throw invalidArchive();
  }
  return normalized;
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
  throw invalidArchive();
}

function writeString(
  buffer: Buffer,
  offset: number,
  length: number,
  value: string,
): void {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.byteLength > length) throw invalidArchive();
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

function sha256(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function invalidArchive(): HubDomainError {
  return new HubDomainError(
    'DEFAULT_APP_RESOURCES_INVALID',
    'The packaged initial release archive is invalid.',
    { status: 500, retryable: false },
  );
}
