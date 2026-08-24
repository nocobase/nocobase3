import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const CREDENTIAL_PREFIX = 'fb1';
const CREDENTIAL_VERSION = 1;
const AUTHENTICATED_CONTEXT = Buffer.from(
  'nocobase-files-field-binding-v1',
  'utf8',
);

export interface FileBindingCredential {
  version: 1;
  audience: string;
  routeId: string;
  recordId: string;
  fileId: string;
  replaceFileId: string | null;
  candidateKey: string;
  expiresAt: number;
}

export type IssueFileBindingCredentialInput = Omit<
  FileBindingCredential,
  'version' | 'audience'
>;

export interface VerifyFileBindingCredentialInput {
  routeId: string;
  recordId: string;
  fileId: string;
}

export interface CreateFileBindingCredentialCodecOptions {
  audience: string;
  secret: string;
  clock?: () => Date;
}

export class InvalidFileBindingCredentialError extends Error {
  constructor() {
    super('The file binding credential is invalid.');
    this.name = new.target.name;
  }
}

export class ExpiredFileBindingCredentialError extends Error {
  constructor() {
    super('The file binding credential has expired.');
    this.name = new.target.name;
  }
}

export class FileBindingCredentialCodec {
  readonly #audience: string;
  readonly #key: Buffer;
  readonly #clock: () => Date;

  constructor(options: CreateFileBindingCredentialCodecOptions) {
    this.#audience = readRequiredString(options.audience);
    this.#key = deriveKey(options.secret);
    this.#clock = options.clock ?? (() => new Date());
  }

  issue(input: IssueFileBindingCredentialInput): string {
    const payload = readCredential({
      ...input,
      version: CREDENTIAL_VERSION,
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
      CREDENTIAL_PREFIX,
      iv.toString('base64url'),
      encrypted.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
    ].join('.');
  }

  verify(
    input: VerifyFileBindingCredentialInput,
    credential: string,
  ): FileBindingCredential {
    const payload = this.#decrypt(credential);
    if (
      payload.audience !== this.#audience ||
      payload.routeId !== input.routeId ||
      payload.recordId !== input.recordId ||
      payload.fileId !== input.fileId
    ) {
      throw new InvalidFileBindingCredentialError();
    }
    if (this.#now() >= payload.expiresAt) {
      throw new ExpiredFileBindingCredentialError();
    }
    return payload;
  }

  #decrypt(credential: string): FileBindingCredential {
    try {
      const parts = credential.split('.');
      if (
        parts.length !== 4 ||
        parts[0] !== CREDENTIAL_PREFIX ||
        !parts[1] ||
        !parts[2] ||
        !parts[3]
      ) {
        throw new InvalidFileBindingCredentialError();
      }
      const iv = Buffer.from(parts[1], 'base64url');
      const encrypted = Buffer.from(parts[2], 'base64url');
      const tag = Buffer.from(parts[3], 'base64url');
      if (iv.length !== 12 || encrypted.length === 0 || tag.length !== 16) {
        throw new InvalidFileBindingCredentialError();
      }
      const decipher = createDecipheriv('aes-256-gcm', this.#key, iv);
      decipher.setAAD(AUTHENTICATED_CONTEXT);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]).toString('utf8');
      return readCredential(JSON.parse(decrypted) as unknown);
    } catch (error) {
      if (error instanceof InvalidFileBindingCredentialError) {
        throw error;
      }
      throw new InvalidFileBindingCredentialError();
    }
  }

  #now(): number {
    const value = this.#clock();
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new Error(
        'Files binding credential clock returned an invalid date.',
      );
    }
    return value.getTime();
  }
}

export function createFileBindingCredentialCodec(
  options: CreateFileBindingCredentialCodecOptions,
): FileBindingCredentialCodec {
  return new FileBindingCredentialCodec(options);
}

function readCredential(value: unknown): FileBindingCredential {
  const record = readRecord(value);
  if (record.version !== CREDENTIAL_VERSION) {
    throw new InvalidFileBindingCredentialError();
  }
  return {
    version: CREDENTIAL_VERSION,
    audience: readRequiredString(record.audience),
    routeId: readRequiredString(record.routeId),
    recordId: readRequiredString(record.recordId),
    fileId: readFileId(record.fileId),
    replaceFileId: readNullableFileId(record.replaceFileId),
    candidateKey: readRequiredString(record.candidateKey),
    expiresAt: readPositiveSafeInteger(record.expiresAt),
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidFileBindingCredentialError();
  }
  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InvalidFileBindingCredentialError();
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > 1024) {
    throw new InvalidFileBindingCredentialError();
  }
  return normalized;
}

function readFileId(value: unknown): string {
  const fileId = readRequiredString(value);
  if (fileId.length > 64) {
    throw new InvalidFileBindingCredentialError();
  }
  return fileId;
}

function readNullableFileId(value: unknown): string | null {
  return value === null ? null : readFileId(value);
}

function readPositiveSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new InvalidFileBindingCredentialError();
  }
  return Number(value);
}

function deriveKey(secret: string): Buffer {
  if (secret.length < 32) {
    throw new Error(
      'Files binding credential secret must contain at least 32 characters.',
    );
  }
  return createHash('sha256')
    .update('nocobase-files-binding-key-v1\0')
    .update(secret)
    .digest();
}
