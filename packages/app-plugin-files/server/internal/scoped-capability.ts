import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

import type { FileTransferDescriptor } from './capability.js';

const CAPABILITY_PREFIX = 'fs1';
const CAPABILITY_VERSION = 1;
const AUTHENTICATED_CONTEXT = Buffer.from(
  'nocobase-files-scoped-capability-v1',
  'utf8',
);

export type ScopedFileCapabilityAction = 'upload' | 'cancel' | 'complete';

export interface ScopedFileCapability extends FileTransferDescriptor {
  version: 1;
  audience: string;
  scope: string;
  recordId: string;
  replaceFileId: string | null;
  action: ScopedFileCapabilityAction;
}

export type IssueScopedFileCapabilityInput = Omit<
  ScopedFileCapability,
  'version' | 'audience'
>;

export interface VerifyScopedFileCapabilityInput {
  scope: string;
  recordId: string;
  fileId: string;
  action: ScopedFileCapabilityAction;
}

export interface CreateScopedFileCapabilityCodecOptions {
  audience: string;
  secret: string;
  clock?: () => Date;
}

export class InvalidScopedFileCapabilityError extends Error {
  constructor() {
    super('The scoped Files capability is invalid.');
    this.name = new.target.name;
  }
}

export class ExpiredScopedFileCapabilityError extends Error {
  constructor() {
    super('The scoped Files capability has expired.');
    this.name = new.target.name;
  }
}

export class ScopedFileCapabilityCodec {
  readonly #audience: string;
  readonly #key: Buffer;
  readonly #clock: () => Date;

  constructor(options: CreateScopedFileCapabilityCodecOptions) {
    this.#audience = readRequiredString(options.audience);
    this.#key = deriveKey(options.secret);
    this.#clock = options.clock ?? (() => new Date());
  }

  issue(input: IssueScopedFileCapabilityInput): string {
    const payload = readCapability({
      ...input,
      version: CAPABILITY_VERSION,
      audience: this.#audience,
    });
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.#key, iv);
    cipher.setAAD(AUTHENTICATED_CONTEXT);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);
    return [
      CAPABILITY_PREFIX,
      iv.toString('base64url'),
      encrypted.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
    ].join('.');
  }

  verify(
    input: VerifyScopedFileCapabilityInput,
    credential: string,
  ): ScopedFileCapability {
    const payload = this.#decrypt(credential);
    if (
      payload.audience !== this.#audience ||
      payload.scope !== input.scope ||
      payload.recordId !== input.recordId ||
      payload.fileId !== input.fileId ||
      payload.action !== input.action
    ) {
      throw new InvalidScopedFileCapabilityError();
    }
    if (this.#now() >= payload.expiresAt) {
      throw new ExpiredScopedFileCapabilityError();
    }
    return payload;
  }

  #decrypt(credential: string): ScopedFileCapability {
    try {
      const parts = credential.split('.');
      if (
        parts.length !== 4 ||
        parts[0] !== CAPABILITY_PREFIX ||
        !parts[1] ||
        !parts[2] ||
        !parts[3]
      ) {
        throw new InvalidScopedFileCapabilityError();
      }
      const iv = Buffer.from(parts[1], 'base64url');
      const encrypted = Buffer.from(parts[2], 'base64url');
      const tag = Buffer.from(parts[3], 'base64url');
      if (iv.length !== 12 || encrypted.length === 0 || tag.length !== 16) {
        throw new InvalidScopedFileCapabilityError();
      }
      const decipher = createDecipheriv('aes-256-gcm', this.#key, iv);
      decipher.setAAD(AUTHENTICATED_CONTEXT);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]).toString('utf8');
      return readCapability(JSON.parse(decrypted) as unknown);
    } catch (error) {
      if (error instanceof InvalidScopedFileCapabilityError) {
        throw error;
      }
      throw new InvalidScopedFileCapabilityError();
    }
  }

  #now(): number {
    const value = this.#clock();
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new Error(
        'Scoped Files capability clock returned an invalid date.',
      );
    }
    return value.getTime();
  }
}

export function createScopedFileCapabilityCodec(
  options: CreateScopedFileCapabilityCodecOptions,
): ScopedFileCapabilityCodec {
  return new ScopedFileCapabilityCodec(options);
}

function readCapability(value: unknown): ScopedFileCapability {
  const record = readRecord(value);
  if (record.version !== CAPABILITY_VERSION) {
    throw new InvalidScopedFileCapabilityError();
  }
  return {
    version: CAPABILITY_VERSION,
    audience: readRequiredString(record.audience),
    scope: readRequiredString(record.scope),
    recordId: readRequiredString(record.recordId),
    fileId: readFileId(record.fileId),
    replaceFileId: readNullableFileId(record.replaceFileId),
    action: readAction(record.action),
    expiresAt: readPositiveSafeInteger(record.expiresAt),
    candidateKey: readRequiredString(record.candidateKey),
    readyKey: readRequiredString(record.readyKey),
    maxBytes: readPositiveSafeInteger(record.maxBytes),
    expectedSize: readNonNegativeSafeInteger(record.expectedSize),
    contentType: readNullableString(record.contentType),
    allowedExtensions: readStringArray(record.allowedExtensions),
    allowedContentTypes: readStringArray(record.allowedContentTypes),
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidScopedFileCapabilityError();
  }
  return value as Record<string, unknown>;
}

function readAction(value: unknown): ScopedFileCapabilityAction {
  if (value === 'upload' || value === 'cancel' || value === 'complete') {
    return value;
  }
  throw new InvalidScopedFileCapabilityError();
}

function readRequiredString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InvalidScopedFileCapabilityError();
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > 1024) {
    throw new InvalidScopedFileCapabilityError();
  }
  return normalized;
}

function readFileId(value: unknown): string {
  const fileId = readRequiredString(value);
  if (fileId.length > 64) {
    throw new InvalidScopedFileCapabilityError();
  }
  return fileId;
}

function readNullableFileId(value: unknown): string | null {
  return value === null ? null : readFileId(value);
}

function readNullableString(value: unknown): string | null {
  return value === null ? null : readRequiredString(value);
}

function readPositiveSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new InvalidScopedFileCapabilityError();
  }
  return Number(value);
}

function readNonNegativeSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new InvalidScopedFileCapabilityError();
  }
  return Number(value);
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new InvalidScopedFileCapabilityError();
  }
  return value.map(readRequiredString);
}

function deriveKey(secret: string): Buffer {
  if (secret.length < 32) {
    throw new Error(
      'Scoped Files capability secret must contain at least 32 characters.',
    );
  }
  return createHash('sha256')
    .update('nocobase-files-scoped-capability-key-v1\0')
    .update(secret)
    .digest();
}
