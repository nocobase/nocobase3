import { randomUUID } from 'node:crypto';

import type { NocoBaseDriveDisk, NocoBaseDriveManager } from '@nocobase/drive';

import { BadRequestError, ServiceUnavailableError } from '../errors.js';

export interface UploadResult {
  name: string;
  size: number;
  type: string;
  key: string;
  url: string | null;
}

export interface PublicFilesRepository {
  upload(input: unknown): Promise<UploadResult>;
}

interface UploadFile {
  name: string;
  size: number;
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export class DrivePublicFilesRepository implements PublicFilesRepository {
  constructor(private readonly drive: NocoBaseDriveManager) {}

  async upload(input: unknown): Promise<UploadResult> {
    const file = ensureUploadFile(input);
    const key = createUploadKey(file);
    const disk = this.drive.use('public');

    await putFile(disk, key, file);

    return {
      name: file.name,
      size: file.size,
      type: file.type,
      key,
      url: await getUrlOrNull(disk, key),
    };
  }
}

export class UnavailablePublicFilesRepository implements PublicFilesRepository {
  constructor(private readonly message = 'File drive is not configured.') {}

  async upload(): Promise<UploadResult> {
    throw new ServiceUnavailableError(this.message);
  }
}

function ensureUploadFile(input: unknown): UploadFile {
  if (isUploadFile(input)) {
    return input;
  }

  throw new BadRequestError('File is required');
}

function isUploadFile(input: unknown): input is UploadFile {
  return Boolean(
    input &&
    typeof input === 'object' &&
    typeof (input as UploadFile).name === 'string' &&
    typeof (input as UploadFile).size === 'number' &&
    typeof (input as UploadFile).type === 'string' &&
    typeof (input as UploadFile).arrayBuffer === 'function',
  );
}

function createUploadKey(file: UploadFile): string {
  return `uploads/${randomUUID()}-${normalizeUploadFileName(file.name)}`;
}

function normalizeUploadFileName(name: string): string {
  const basename = name.split(/[/\\]/).pop()?.trim() || 'upload.bin';
  const normalized = basename
    .replace(/[^\w. -]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 128);

  return normalized || 'upload.bin';
}

async function putFile(
  disk: NocoBaseDriveDisk,
  key: string,
  file: UploadFile,
): Promise<void> {
  await disk.put(key, new Uint8Array(await file.arrayBuffer()), {
    contentType: file.type || undefined,
  });
}

async function getUrlOrNull(
  disk: NocoBaseDriveDisk,
  key: string,
): Promise<string | null> {
  try {
    return await disk.getUrl(key);
  } catch {
    return null;
  }
}
