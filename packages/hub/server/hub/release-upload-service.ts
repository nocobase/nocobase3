import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { DatabaseConnection, Row } from '@nocobase/app-database';

import { computeReleaseArtifactChecksum } from './artifact-integrity.ts';
import { HubDomainError } from './store.ts';

const DEFAULT_MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_EXTRACTED_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_FILES = 100_000;
const DEFAULT_UPLOAD_TTL_MS = 2 * 60 * 60 * 1000;
const CHECKSUM_PATTERN = /^sha256:[0-9a-f]{64}$/;

export interface ReleaseUploadActor {
  readonly userId: string;
  readonly credentialId: string | null;
  readonly isAdmin?: boolean;
}

export interface ReleaseUploadCreateInput {
  readonly version: string;
  readonly checksum: string;
  readonly sizeBytes: number;
  readonly archiveChecksum: string;
  readonly archiveSizeBytes: number;
  readonly archiveFormat: 'tar.gz';
  readonly manifest: Record<string, unknown>;
}

export interface ReleaseUploadServiceOptions {
  readonly releaseRoot: string;
  readonly now?: () => Date;
  readonly maxArchiveBytes?: number;
  readonly maxExtractedBytes?: number;
  readonly uploadTtlSeconds?: number;
}

export type ReleaseUploadStatus =
  | 'created'
  | 'uploaded'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'cancelled';

export interface PublicReleaseUpload {
  readonly id: string;
  readonly applicationId: string;
  readonly status: ReleaseUploadStatus;
  readonly version: string;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly uploadedAt: string | null;
  readonly completedAt: string | null;
  readonly failure: { readonly code: string; readonly message: string } | null;
  readonly release: PublicReleaseUploadRelease | null;
}

export interface PublicReleaseUploadRelease {
  readonly id: string;
  readonly applicationId: string;
  readonly version: string;
  readonly checksum: string;
  readonly sizeBytes: number | null;
  readonly verificationStatus: string;
  readonly createdAt: string;
}

export interface ReleaseUploadMutationResult {
  readonly upload: PublicReleaseUpload;
  readonly idempotent: boolean;
}

export class ReleaseUploadService {
  private readonly releaseRoot: string;
  private readonly now: () => Date;
  private readonly maxArchiveBytes: number;
  private readonly maxExtractedBytes: number;
  private readonly uploadTtlMs: number;
  private readonly completions = new Map<
    string,
    Promise<PublicReleaseUpload>
  >();

  constructor(
    private readonly connection: DatabaseConnection,
    options: ReleaseUploadServiceOptions,
  ) {
    this.releaseRoot = path.resolve(options.releaseRoot);
    this.now = options.now ?? (() => new Date());
    this.maxArchiveBytes = positiveLimit(
      options.maxArchiveBytes,
      DEFAULT_MAX_ARCHIVE_BYTES,
      'maxArchiveBytes',
    );
    this.maxExtractedBytes = positiveLimit(
      options.maxExtractedBytes,
      DEFAULT_MAX_EXTRACTED_BYTES,
      'maxExtractedBytes',
    );
    this.uploadTtlMs =
      positiveLimit(
        options.uploadTtlSeconds,
        DEFAULT_UPLOAD_TTL_MS / 1_000,
        'uploadTtlSeconds',
      ) * 1_000;
  }

  async create(
    applicationId: string,
    input: ReleaseUploadCreateInput,
    actor: ReleaseUploadActor,
  ): Promise<PublicReleaseUpload> {
    validateCreateInput(input);
    if (input.archiveSizeBytes > this.maxArchiveBytes) {
      throw new HubDomainError(
        'UPLOAD_ARCHIVE_TOO_LARGE',
        'Declared archive size exceeds the maximum size.',
        { status: 413 },
      );
    }
    if (input.sizeBytes > this.maxExtractedBytes) {
      throw new HubDomainError(
        'RELEASE_ARCHIVE_TOO_LARGE',
        'Declared release size exceeds the maximum size.',
        { status: 413 },
      );
    }
    assertSafeIdentifier(applicationId, 'applicationId');
    const application = await this.connection.query
      .selectFrom('hubApplications')
      .select(['id', 'slug', 'status'])
      .where('id', '=', applicationId)
      .executeTakeFirst();
    if (!application) {
      throw new HubDomainError(
        'APPLICATION_NOT_FOUND',
        'Application was not found.',
        {
          status: 404,
        },
      );
    }
    if (String(application.status) !== 'active') {
      throw stateConflict(
        'APPLICATION_ARCHIVED',
        'Archived applications cannot publish releases.',
      );
    }
    assertManifestContract(input.manifest, `/${String(application.slug)}`);
    const now = this.now();
    const id = crypto.randomUUID();
    const row = {
      id,
      applicationId,
      version: input.version,
      checksum: input.checksum,
      sizeBytes: input.sizeBytes,
      archiveChecksum: input.archiveChecksum,
      archiveSizeBytes: input.archiveSizeBytes,
      archiveFormat: input.archiveFormat,
      manifest: JSON.stringify(input.manifest),
      status: 'created',
      storageKey: null,
      releaseId: null,
      failureCode: null,
      failureMessage: null,
      createdBy: actor.userId,
      credentialId: actor.credentialId,
      expiresAt: new Date(now.valueOf() + this.uploadTtlMs),
      uploadedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.connection.query
      .insertInto('hubReleaseUploads')
      .values(row)
      .execute();
    return toPublicUpload(row);
  }

  async putContent(
    uploadId: string,
    actor: ReleaseUploadActor,
    content: Uint8Array,
  ): Promise<void> {
    const row = await this.requireOwned(uploadId, actor);
    ensureNotExpired(row, this.now());
    const status = String(row.status) as ReleaseUploadStatus;
    if (status !== 'created' && status !== 'uploaded') {
      throw stateConflict(
        'UPLOAD_STATE_CONFLICT',
        'Upload content is no longer writable.',
      );
    }
    if (content.byteLength !== Number(row.archiveSizeBytes)) {
      throw new HubDomainError(
        'UPLOAD_ARCHIVE_SIZE_MISMATCH',
        'Uploaded archive size does not match the declared size.',
        { status: 422 },
      );
    }
    const checksum = `sha256:${createHash('sha256').update(content).digest('hex')}`;
    if (checksum !== String(row.archiveChecksum)) {
      throw new HubDomainError(
        'UPLOAD_ARCHIVE_CHECKSUM_MISMATCH',
        'Uploaded archive checksum does not match the declared checksum.',
        { status: 422 },
      );
    }
    if (content.byteLength > this.maxArchiveBytes) {
      throw new HubDomainError(
        'UPLOAD_ARCHIVE_TOO_LARGE',
        'Uploaded archive exceeds the maximum size.',
        { status: 413 },
      );
    }
    const temporaryDirectory = path.join(this.releaseRoot, '.uploads');
    await mkdir(temporaryDirectory, { recursive: true });
    const temporaryPath = path.join(
      temporaryDirectory,
      `${uploadId}.tar.gz.part`,
    );
    await writeFile(temporaryPath, content, { flag: 'w' });
    const finalPath = this.uploadPath(uploadId);
    await rename(temporaryPath, finalPath);
    const now = this.now();
    await this.connection.query
      .updateTable('hubReleaseUploads')
      .set({ status: 'uploaded', uploadedAt: now, updatedAt: now })
      .where('id', '=', uploadId)
      .where('status', 'in', ['created', 'uploaded'])
      .execute();
  }

  async startCompletion(
    uploadId: string,
    actor: ReleaseUploadActor,
  ): Promise<ReleaseUploadMutationResult> {
    const row = await this.requireOwned(uploadId, actor);
    ensureNotExpired(row, this.now());
    const status = String(row.status) as ReleaseUploadStatus;
    if (status === 'completed' || status === 'failed') {
      return { upload: toPublicUpload(row), idempotent: true };
    }
    if (status === 'verifying') {
      if (!this.completions.has(uploadId)) {
        const completion = this.verify(uploadId, row).finally(() => {
          this.completions.delete(uploadId);
        });
        this.completions.set(uploadId, completion);
        void completion.catch(() => undefined);
      }
      return { upload: toPublicUpload(row), idempotent: true };
    }
    if (status !== 'uploaded') {
      throw stateConflict(
        'UPLOAD_NOT_READY',
        'Upload content must be uploaded before verification.',
      );
    }
    const updated = await this.connection.query
      .updateTable('hubReleaseUploads')
      .set({ status: 'verifying', updatedAt: this.now() })
      .where('id', '=', uploadId)
      .where('status', '=', 'uploaded')
      .execute();
    if (updated.updatedCount !== 1) {
      const replay = await this.requireOwned(uploadId, actor);
      return { upload: toPublicUpload(replay), idempotent: true };
    }
    const verifying = await this.requireOwned(uploadId, actor);
    const completion = this.verify(uploadId, verifying).finally(() => {
      this.completions.delete(uploadId);
    });
    this.completions.set(uploadId, completion);
    void completion.catch(() => undefined);
    return { upload: toPublicUpload(verifying), idempotent: false };
  }

  async waitForCompletion(uploadId: string): Promise<PublicReleaseUpload> {
    const running = this.completions.get(uploadId);
    if (running) return running;
    const row = await this.requireUpload(uploadId);
    return toPublicUpload(row);
  }

  async get(
    uploadId: string,
    actor: ReleaseUploadActor,
  ): Promise<PublicReleaseUpload> {
    const row = await this.requireOwned(uploadId, actor, true);
    return toPublicUpload(row);
  }

  async cancel(
    uploadId: string,
    actor: ReleaseUploadActor,
  ): Promise<ReleaseUploadMutationResult> {
    const row = await this.requireOwned(uploadId, actor, true);
    const status = String(row.status) as ReleaseUploadStatus;
    if (status === 'cancelled') {
      return { upload: toPublicUpload(row), idempotent: true };
    }
    if (status === 'completed' || status === 'verifying') {
      throw stateConflict(
        'UPLOAD_STATE_CONFLICT',
        'Completed uploads cannot be cancelled.',
      );
    }
    await this.connection.query
      .updateTable('hubReleaseUploads')
      .set({ status: 'cancelled', updatedAt: this.now() })
      .where('id', '=', uploadId)
      .where('status', 'in', ['created', 'uploaded', 'failed', 'expired'])
      .execute();
    await rm(this.uploadPath(uploadId), { force: true });
    return {
      upload: toPublicUpload(await this.requireUpload(uploadId)),
      idempotent: false,
    };
  }

  private async verify(
    uploadId: string,
    row: Row,
  ): Promise<PublicReleaseUpload> {
    const temporaryPath = this.uploadPath(uploadId);
    const extractionPath = path.join(
      this.releaseRoot,
      '.uploads',
      `${uploadId}.extract`,
    );
    let movedPath: string | undefined;
    try {
      const archive = await readFile(temporaryPath);
      if (archive.byteLength !== Number(row.archiveSizeBytes)) {
        throw new HubDomainError(
          'UPLOAD_ARCHIVE_SIZE_MISMATCH',
          'Stored archive size does not match the declared size.',
          { status: 422 },
        );
      }
      const archiveChecksum = `sha256:${createHash('sha256').update(archive).digest('hex')}`;
      if (archiveChecksum !== String(row.archiveChecksum)) {
        throw new HubDomainError(
          'UPLOAD_ARCHIVE_CHECKSUM_MISMATCH',
          'Stored archive checksum does not match the declared checksum.',
          { status: 422 },
        );
      }
      await rm(extractionPath, { recursive: true, force: true });
      const extracted = await extractTarGzip(archive, extractionPath, {
        maxArchiveBytes: this.maxArchiveBytes,
        maxExtractedBytes: this.maxExtractedBytes,
      });
      const manifest = parseManifest(extracted.manifestBytes);
      const expectedManifest = parseJson(row.manifest, 'manifest');
      if (stableJson(manifest) !== stableJson(expectedManifest)) {
        throw new HubDomainError(
          'RELEASE_MANIFEST_MISMATCH',
          'Release manifest does not match the upload request.',
          { status: 422 },
        );
      }
      const application = await this.connection.query
        .selectFrom('hubApplications')
        .select(['slug', 'status'])
        .where('id', '=', String(row.applicationId))
        .executeTakeFirst();
      if (!application) {
        throw new HubDomainError(
          'APPLICATION_NOT_FOUND',
          'Application was not found.',
          {
            status: 404,
          },
        );
      }
      if (String(application.status) !== 'active') {
        throw stateConflict(
          'APPLICATION_ARCHIVED',
          'Archived applications cannot publish releases.',
        );
      }
      assertManifestContract(manifest, `/${String(application.slug)}`);
      await assertRegularFile(
        path.join(extractionPath, 'dist/server/embedded.js'),
        'RELEASE_SERVER_ENTRYPOINT_MISSING',
      );
      const checksum = await computeReleaseArtifactChecksum(extractionPath);
      if (checksum !== String(row.checksum)) {
        throw new HubDomainError(
          'RELEASE_CHECKSUM_MISMATCH',
          'Release artifact does not match its declared checksum.',
          { status: 422 },
        );
      }
      if (extracted.sizeBytes !== Number(row.sizeBytes)) {
        throw new HubDomainError(
          'RELEASE_SIZE_MISMATCH',
          'Release artifact size does not match its declaration.',
          { status: 422 },
        );
      }
      const existing = await this.connection.query
        .selectFrom('hubReleases')
        .selectAll()
        .where('applicationId', '=', String(row.applicationId))
        .where('version', '=', String(row.version))
        .executeTakeFirst();
      if (existing) {
        if (String(existing.checksum) !== String(row.checksum)) {
          throw new HubDomainError(
            'RELEASE_VERSION_CONFLICT',
            'Release version already exists with a different checksum.',
            { status: 409 },
          );
        }
        await rm(extractionPath, { recursive: true, force: true });
        const now = this.now();
        await this.connection.query
          .updateTable('hubReleaseUploads')
          .set({
            status: 'completed',
            releaseId: String(existing.id),
            completedAt: now,
            updatedAt: now,
            failureCode: null,
            failureMessage: null,
          })
          .where('id', '=', uploadId)
          .execute();
        await rm(temporaryPath, { force: true });
        return toPublicUpload(await this.requireUpload(uploadId));
      }
      const releaseId = crypto.randomUUID();
      const storageKey = path.posix.join(String(row.applicationId), releaseId);
      const finalPath = path.join(this.releaseRoot, ...storageKey.split('/'));
      await mkdir(path.dirname(finalPath), { recursive: true });
      await rename(extractionPath, finalPath);
      movedPath = finalPath;
      const now = this.now();
      const credentialId =
        typeof row.credentialId === 'string' ? row.credentialId : null;
      await this.connection.transaction(async (connection) => {
        const credential = credentialId
          ? await connection.query
              .selectFrom('hubAgentCredentials')
              .select(['id', 'clientName'])
              .where('id', '=', credentialId)
              .executeTakeFirst<{ id: string; clientName: string }>()
          : undefined;
        await connection.query
          .insertInto('hubReleases')
          .values({
            id: releaseId,
            applicationId: String(row.applicationId),
            version: String(row.version),
            checksum: String(row.checksum),
            manifest: JSON.stringify(manifest),
            storageKey,
            sizeBytes: Number(row.sizeBytes),
            verificationStatus: 'verified',
            createdBy: String(row.createdBy),
            createdAt: now,
          })
          .execute();
        await connection.query
          .updateTable('hubReleaseUploads')
          .set({
            status: 'completed',
            releaseId,
            completedAt: now,
            updatedAt: now,
            failureCode: null,
            failureMessage: null,
          })
          .where('id', '=', uploadId)
          .execute();
        await connection.query
          .insertInto('hubAuditLogs')
          .values({
            id: crypto.randomUUID(),
            actorId: String(row.createdBy),
            applicationId: String(row.applicationId),
            action: 'release.published',
            resource: 'release',
            resourceId: releaseId,
            result: 'success',
            source: credentialId ? 'agent' : 'web',
            client: credentialId
              ? JSON.stringify({
                  credentialId,
                  ...(credential?.clientName
                    ? { name: credential.clientName }
                    : {}),
                })
              : null,
            failureCode: null,
            details: JSON.stringify({ version: String(row.version) }),
            requestId: null,
            createdAt: now,
          })
          .execute();
      });
      await rm(temporaryPath, { force: true });
      return toPublicUpload(await this.requireUpload(uploadId));
    } catch (error) {
      await rm(extractionPath, { recursive: true, force: true }).catch(
        () => undefined,
      );
      if (movedPath) {
        await rm(movedPath, { recursive: true, force: true }).catch(
          () => undefined,
        );
      }
      await this.markFailed(uploadId, error);
      return toPublicUpload(await this.requireUpload(uploadId));
    }
  }

  private async markFailed(uploadId: string, error: unknown): Promise<void> {
    const domain =
      error instanceof HubDomainError
        ? error
        : new HubDomainError(
            'RELEASE_VERIFICATION_FAILED',
            'Release verification failed.',
            { status: 422, cause: error },
          );
    await this.connection.query
      .updateTable('hubReleaseUploads')
      .set({
        status: 'failed',
        failureCode: domain.code,
        failureMessage: domain.message,
        updatedAt: this.now(),
      })
      .where('id', '=', uploadId)
      .where('status', '=', 'verifying')
      .execute();
  }

  private async requireUpload(uploadId: string): Promise<Row> {
    const row = await this.connection.query
      .selectFrom('hubReleaseUploads')
      .selectAll()
      .where('id', '=', uploadId)
      .executeTakeFirst();
    if (!row) throw notFound();
    return row;
  }

  private async requireOwned(
    uploadId: string,
    actor: ReleaseUploadActor,
    allowBrowserAdmin: boolean = false,
  ): Promise<Row> {
    const row = await this.requireUpload(uploadId);
    if (allowBrowserAdmin && actor.isAdmin && actor.credentialId === null) {
      return row;
    }
    const owner = String(row.createdBy) === actor.userId;
    const credentialMatches =
      (row.credentialId === null && actor.credentialId === null) ||
      (row.credentialId !== null && row.credentialId === actor.credentialId);
    if (!owner || !credentialMatches) throw notFound();
    return row;
  }

  private uploadPath(uploadId: string): string {
    return path.join(this.releaseRoot, '.uploads', `${uploadId}.tar.gz`);
  }
}

async function extractTarGzip(
  archive: Uint8Array,
  destination: string,
  limits: {
    readonly maxArchiveBytes: number;
    readonly maxExtractedBytes: number;
  },
): Promise<{ manifestBytes: Uint8Array; sizeBytes: number }> {
  if (archive.byteLength > limits.maxArchiveBytes) {
    throw new HubDomainError(
      'RELEASE_ARCHIVE_TOO_LARGE',
      'Release archive is too large.',
      { status: 413 },
    );
  }
  const tar = gunzipSync(archive, {
    maxOutputLength: limits.maxExtractedBytes,
  });
  await mkdir(destination, { recursive: true });
  let offset = 0;
  let files = 0;
  let total = 0;
  let manifestBytes: Uint8Array | undefined;
  let pendingLongName: string | undefined;
  while (offset + 512 <= tar.byteLength) {
    const header = tar.subarray(offset, offset + 512);
    offset += 512;
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
      throw new HubDomainError(
        'RELEASE_ARCHIVE_INVALID',
        'Release archive contains an invalid or truncated entry.',
        { status: 422 },
      );
    }
    const type = String.fromCharCode(header[156] || 48);
    if (fullName === '././@LongLink' || type === 'L') {
      pendingLongName = decodeTarData(tar, offset, size).replace(/\0.*$/, '');
    }
    if (fullName === 'PaxHeaders.0' || type === 'x' || type === 'g') {
      offset += paddedSize(size);
      continue;
    }
    if (!fullName || fullName === '.' || fullName === './') {
      offset += paddedSize(size);
      continue;
    }
    const archivePath = normalizeArchivePath(fullName);
    if (type !== '0' && type !== '\0' && type !== '5') {
      throw new HubDomainError(
        'RELEASE_ARCHIVE_UNSUPPORTED_ENTRY',
        'Release archive contains an unsupported entry.',
        { status: 422 },
      );
    }
    if (type === '5') {
      await mkdir(path.join(destination, archivePath), { recursive: true });
    } else {
      files += 1;
      total += size;
      if (
        files > MAX_FILES ||
        size > limits.maxExtractedBytes ||
        total > limits.maxExtractedBytes
      ) {
        throw new HubDomainError(
          'RELEASE_ARCHIVE_TOO_LARGE',
          'Release archive expands beyond limits.',
          { status: 413 },
        );
      }
      const data = tar.subarray(offset, offset + size);
      const target = path.join(destination, archivePath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, data, { flag: 'wx' });
      if (archivePath === 'nocobase-release.json') manifestBytes = data;
    }
    offset += paddedSize(size);
  }
  if (!manifestBytes) {
    throw new HubDomainError(
      'RELEASE_MANIFEST_MISSING',
      'Release manifest is missing.',
      { status: 422 },
    );
  }
  return { manifestBytes, sizeBytes: total };
}

function validateCreateInput(input: ReleaseUploadCreateInput): void {
  if (
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
      input.version,
    )
  ) {
    throw new HubDomainError(
      'INVALID_RELEASE_VERSION',
      'Release version must be valid SemVer.',
      { status: 422 },
    );
  }
  for (const value of [input.checksum, input.archiveChecksum]) {
    if (!CHECKSUM_PATTERN.test(value))
      throw new HubDomainError(
        'RELEASE_CHECKSUM_INVALID',
        'Release checksum is invalid.',
        { status: 422 },
      );
  }
  if (
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes < 0 ||
    !Number.isSafeInteger(input.archiveSizeBytes) ||
    input.archiveSizeBytes < 0
  ) {
    throw new HubDomainError(
      'INVALID_RELEASE_SIZE',
      'Release sizes must be non-negative safe integers.',
      { status: 422 },
    );
  }
  if (input.archiveFormat !== 'tar.gz')
    throw new HubDomainError(
      'UNSUPPORTED_ARCHIVE_FORMAT',
      'Only tar.gz archives are supported.',
      { status: 415 },
    );
}

function parseManifest(bytes: Uint8Array): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(bytes).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('not object');
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new HubDomainError(
      'RELEASE_MANIFEST_INVALID',
      'Release manifest is invalid JSON.',
      { status: 422, cause: error },
    );
  }
}

function assertManifestContract(
  manifest: Record<string, unknown>,
  basePath: string,
): void {
  if (manifest.schemaVersion !== 1 || manifest.basePath !== basePath) {
    throw new HubDomainError(
      'RELEASE_MANIFEST_INVALID',
      'Release manifest schema or base path is invalid.',
      { status: 422 },
    );
  }
  const server = manifest.server;
  if (
    !server ||
    typeof server !== 'object' ||
    Array.isArray(server) ||
    (server as Record<string, unknown>).entrypoint !==
      'dist/server/embedded.js' ||
    (server as Record<string, unknown>).healthPath !== '/api/healthz'
  )
    throw new HubDomainError(
      'RELEASE_MANIFEST_INVALID',
      'Release manifest server contract is invalid.',
      { status: 422 },
    );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function assertRegularFile(
  filePath: string,
  code: string,
): Promise<void> {
  try {
    if ((await stat(filePath)).isFile()) return;
  } catch {
    // Converted into the public domain error below.
  }
  throw new HubDomainError(code, 'Release server entrypoint is missing.', {
    status: 422,
  });
}

function parseJson(value: unknown, label: string): Record<string, unknown> {
  try {
    const parsed: unknown =
      typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('not object');
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new HubDomainError(
      'INVALID_JSON',
      `${label} must be a JSON object.`,
      { status: 500, cause: error },
    );
  }
}

function toPublicUpload(row: Record<string, unknown>): PublicReleaseUpload {
  const failureCode =
    typeof row.failureCode === 'string' && row.failureCode
      ? row.failureCode
      : null;
  const failureMessage =
    typeof row.failureMessage === 'string'
      ? row.failureMessage
      : 'Release verification failed.';
  const releaseId =
    typeof row.releaseId === 'string' && row.releaseId ? row.releaseId : null;
  return {
    id: String(row.id),
    applicationId: String(row.applicationId),
    status: String(row.status) as ReleaseUploadStatus,
    version: String(row.version),
    expiresAt: dateString(row.expiresAt),
    createdAt: dateString(row.createdAt),
    uploadedAt: hasDateValue(row.uploadedAt)
      ? dateString(row.uploadedAt)
      : null,
    completedAt: hasDateValue(row.completedAt)
      ? dateString(row.completedAt)
      : null,
    failure: failureCode
      ? { code: failureCode, message: failureMessage }
      : null,
    release: releaseId
      ? {
          id: releaseId,
          applicationId: String(row.applicationId),
          version: String(row.version),
          checksum: String(row.checksum),
          sizeBytes: Number(row.sizeBytes),
          verificationStatus: 'verified',
          createdAt: hasDateValue(row.completedAt)
            ? dateString(row.completedAt)
            : dateString(row.createdAt),
        }
      : null,
  };
}

function ensureNotExpired(row: Row, now: Date): void {
  if (new Date(String(row.expiresAt)).valueOf() <= now.valueOf()) {
    throw new HubDomainError('UPLOAD_EXPIRED', 'Release upload has expired.', {
      status: 410,
    });
  }
}

function normalizeArchivePath(value: string): string {
  let normalized = value.replaceAll('\\', '/');
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  normalized = normalized.replace(/\/$/, '');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    normalized
      .split('/')
      .some((part) => part === '..' || part === '' || part === '.')
  ) {
    throw new HubDomainError(
      'RELEASE_ARCHIVE_UNSAFE_PATH',
      'Release archive contains an unsafe path.',
      { status: 422 },
    );
  }
  const basename = normalized.split('/').at(-1) ?? '';
  if (basename === '.env' || basename.startsWith('.env.')) {
    throw new HubDomainError(
      'RELEASE_ARCHIVE_SECRET_FILE',
      'Release archive contains a secret environment file.',
      { status: 422 },
    );
  }
  return normalized;
}

function assertSafeIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
    throw new HubDomainError('INVALID_IDENTIFIER', `${label} is invalid.`, {
      status: 400,
    });
  }
}

function readTarString(
  header: Uint8Array,
  offset: number,
  length: number,
): string {
  return Buffer.from(header.subarray(offset, offset + length))
    .toString('utf8')
    .replace(/\0.*$/, '')
    .trim();
}

function readTarNumber(
  header: Uint8Array,
  offset: number,
  length: number,
): number {
  const value = readTarString(header, offset, length).replace(/\0/g, '').trim();
  return value ? Number.parseInt(value, 8) : 0;
}

function decodeTarData(tar: Uint8Array, offset: number, size: number): string {
  return Buffer.from(tar.subarray(offset, offset + size)).toString('utf8');
}

function paddedSize(size: number): number {
  return Math.ceil(size / 512) * 512;
}

function dateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'bigint') {
    return new Date(Number(value)).toISOString();
  }
  const text = String(value);
  if (/^\d+$/.test(text)) return new Date(Number(text)).toISOString();
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString();
  const sqliteParsed = new Date(`${text.replace(' ', 'T')}Z`);
  if (!Number.isNaN(sqliteParsed.valueOf())) return sqliteParsed.toISOString();
  throw new HubDomainError(
    'INVALID_TIMESTAMP',
    'Hub returned an invalid timestamp.',
    { status: 500 },
  );
}

function hasDateValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}

function stateConflict(code: string, message: string): HubDomainError {
  return new HubDomainError(code, message, { status: 409 });
}

function notFound(): HubDomainError {
  return new HubDomainError(
    'UPLOAD_NOT_FOUND',
    'Release upload was not found.',
    { status: 404 },
  );
}

function positiveLimit(
  value: number | undefined,
  fallback: number,
  field: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new HubDomainError(
      'UPLOAD_CONFIGURATION_INVALID',
      `${field} must be a positive safe integer.`,
      { status: 500 },
    );
  }
  return resolved;
}
