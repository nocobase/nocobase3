import type { FileTransferDescriptor } from './capability.js';
import {
  createSealedCredentialCodec,
  type SealedCredentialCodec,
} from './sealed-credential.js';

const CAPABILITY_PREFIX = 'fs1';
const CAPABILITY_VERSION = 1;
const AUTHENTICATED_CONTEXT = 'nocobase-files-scoped-capability-v1';

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
  readonly #credentialCodec: SealedCredentialCodec;
  readonly #clock: () => Date;

  constructor(options: CreateScopedFileCapabilityCodecOptions) {
    this.#audience = readRequiredString(options.audience);
    this.#credentialCodec = createSealedCredentialCodec({
      prefix: CAPABILITY_PREFIX,
      authenticatedContext: AUTHENTICATED_CONTEXT,
      keyPurpose: 'nocobase-files-scoped-capability-key-v1',
      secret: options.secret,
      secretError:
        'Scoped Files capability secret must contain at least 32 characters.',
      invalidCredential: () => new InvalidScopedFileCapabilityError(),
    });
    this.#clock = options.clock ?? (() => new Date());
  }

  issue(input: IssueScopedFileCapabilityInput): string {
    const payload = readCapability({
      ...input,
      version: CAPABILITY_VERSION,
      audience: this.#audience,
    });
    return this.#credentialCodec.seal(payload);
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
    return readCapability(this.#credentialCodec.unseal(credential));
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
