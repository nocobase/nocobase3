import {
  createSealedCredentialCodec,
  type SealedCredentialCodec,
} from './sealed-credential.js';

const CAPABILITY_PREFIX = 'fc1';
const CAPABILITY_VERSION = 1;
const AUTHENTICATED_CONTEXT = 'nocobase-files-capability-v1';

export type FileCapabilityAction = 'upload' | 'cancel' | 'complete' | 'read';
export type FileCapabilityDisposition = 'inline' | 'attachment';

interface CapabilityBase {
  version: 1;
  audience: string;
  fileId: string;
  action: FileCapabilityAction;
  expiresAt: number;
}

export interface FileTransferDescriptor {
  fileId: string;
  expiresAt: number;
  candidateKey: string;
  maxBytes: number;
  expectedSize: number;
  contentType: string | null;
  allowedExtensions: readonly string[];
  allowedContentTypes: readonly string[];
}

export interface FileUploadCapability
  extends CapabilityBase, FileTransferDescriptor {
  action: 'upload' | 'cancel' | 'complete';
}

export interface FileReadCapability extends CapabilityBase {
  action: 'read';
  disposition: FileCapabilityDisposition;
}

export type FileCapability = FileUploadCapability | FileReadCapability;

export type IssueFileCapabilityInput =
  | Omit<FileUploadCapability, 'version' | 'audience'>
  | Omit<FileReadCapability, 'version' | 'audience'>;

export interface VerifyFileCapabilityInput {
  fileId: string;
  action: FileCapabilityAction;
}

export interface CreateFileCapabilityCodecOptions {
  audience: string;
  secret: string;
  clock?: () => Date;
}

export class InvalidFileCapabilityError extends Error {
  constructor() {
    super('The Files capability is invalid.');
    this.name = new.target.name;
  }
}

export class ExpiredFileCapabilityError extends Error {
  constructor() {
    super('The Files capability has expired.');
    this.name = new.target.name;
  }
}

export class FileCapabilityCodec {
  readonly #audience: string;
  readonly #credentialCodec: SealedCredentialCodec;
  readonly #clock: () => Date;

  constructor(options: CreateFileCapabilityCodecOptions) {
    this.#audience = readAudience(options.audience);
    this.#credentialCodec = createSealedCredentialCodec({
      prefix: CAPABILITY_PREFIX,
      authenticatedContext: AUTHENTICATED_CONTEXT,
      keyPurpose: 'nocobase-files-capability-key-v1',
      secret: options.secret,
      secretError:
        'Files capability secret must contain at least 32 characters.',
      invalidCredential: () => new InvalidFileCapabilityError(),
    });
    this.#clock = options.clock ?? (() => new Date());
  }

  issue(input: IssueFileCapabilityInput): string {
    const payload: FileCapability = normalizeIssuedCapability(
      input,
      this.#audience,
    );
    return this.#credentialCodec.seal(payload);
  }

  verify(input: VerifyFileCapabilityInput, credential: string): FileCapability {
    const payload = this.#decrypt(credential);
    if (
      payload.audience !== this.#audience ||
      payload.fileId !== input.fileId ||
      payload.action !== input.action
    ) {
      throw new InvalidFileCapabilityError();
    }
    if (this.#now() >= payload.expiresAt) {
      throw new ExpiredFileCapabilityError();
    }
    return payload;
  }

  #decrypt(credential: string): FileCapability {
    return readCapability(this.#credentialCodec.unseal(credential));
  }

  #now(): number {
    const value = this.#clock();
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new Error('Files capability clock returned an invalid date.');
    }
    return value.getTime();
  }
}

export function createFileCapabilityCodec(
  options: CreateFileCapabilityCodecOptions,
): FileCapabilityCodec {
  return new FileCapabilityCodec(options);
}

function normalizeIssuedCapability(
  input: IssueFileCapabilityInput,
  audience: string,
): FileCapability {
  return readCapability({
    ...input,
    version: CAPABILITY_VERSION,
    audience,
  });
}

function readCapability(value: unknown): FileCapability {
  const record = readRecord(value);
  const base = {
    version: readVersion(record.version),
    audience: readString(record.audience),
    fileId: readFileId(record.fileId),
    action: readAction(record.action),
    expiresAt: readPositiveSafeInteger(record.expiresAt),
  } as const;

  if (base.action === 'read') {
    return {
      ...base,
      action: 'read',
      disposition: readDisposition(record.disposition),
    };
  }

  return {
    ...base,
    action: base.action,
    candidateKey: readString(record.candidateKey),
    maxBytes: readPositiveSafeInteger(record.maxBytes),
    expectedSize: readNonNegativeSafeInteger(record.expectedSize),
    contentType: readNullableString(record.contentType),
    allowedExtensions: readStringArray(record.allowedExtensions),
    allowedContentTypes: readStringArray(record.allowedContentTypes),
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidFileCapabilityError();
  }
  return value as Record<string, unknown>;
}

function readVersion(value: unknown): 1 {
  if (value !== CAPABILITY_VERSION) {
    throw new InvalidFileCapabilityError();
  }
  return CAPABILITY_VERSION;
}

function readAction(value: unknown): FileCapabilityAction {
  if (
    value === 'upload' ||
    value === 'cancel' ||
    value === 'complete' ||
    value === 'read'
  ) {
    return value;
  }
  throw new InvalidFileCapabilityError();
}

function readDisposition(value: unknown): FileCapabilityDisposition {
  if (value === 'inline' || value === 'attachment') {
    return value;
  }
  throw new InvalidFileCapabilityError();
}

function readAudience(value: string): string {
  const audience = value.trim();
  if (!audience || audience.length > 255) {
    throw new Error(
      'Files capability audience must contain 1 to 255 characters.',
    );
  }
  return audience;
}

function readString(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 1024) {
    throw new InvalidFileCapabilityError();
  }
  return value;
}

function readFileId(value: unknown): string {
  const fileId = readString(value);
  if (fileId.length > 64) {
    throw new InvalidFileCapabilityError();
  }
  return fileId;
}

function readNullableString(value: unknown): string | null {
  return value === null ? null : readString(value);
}

function readPositiveSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new InvalidFileCapabilityError();
  }
  return Number(value);
}

function readNonNegativeSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new InvalidFileCapabilityError();
  }
  return Number(value);
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new InvalidFileCapabilityError();
  }
  return value.map(readString);
}
