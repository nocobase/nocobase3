import { createHmac, timingSafeEqual } from 'node:crypto';

import {
  ExpiredFileTokenError,
  InvalidFileInputError,
  InvalidFileTokenError,
} from './errors.js';

export const DEFAULT_FILE_TOKEN_TTL_SECONDS: number = 900;
export const MAX_FILE_TOKEN_TTL_SECONDS: number = 86_400;

export interface FileTokenPayload {
  readonly version: 1;
  readonly audience: string;
  readonly fileId: string;
  readonly expiresAt: number;
}

export interface IssueFileTokenOptions {
  readonly secret: string;
  readonly audience: string;
  readonly fileId: string;
  readonly expiresIn?: number;
  readonly now?: number;
}

export interface IssuedFileToken {
  readonly token: string;
  readonly expiresAt: number;
}

export interface VerifyFileTokenOptions {
  readonly secret: string;
  readonly audience: string;
  readonly fileId: string;
  readonly token: string;
  readonly now?: number;
}

const BASE64URL_PART = /^[A-Za-z0-9_-]+$/;

export function issueFileToken(
  options: IssueFileTokenOptions,
): IssuedFileToken {
  assertSigningInput(options.secret, options.audience, options.fileId);
  const ttl = resolveTtl(options.expiresIn);
  const now = resolveEpochSeconds(options.now, 'Current time');
  const payload: FileTokenPayload = {
    version: 1,
    audience: options.audience,
    fileId: options.fileId,
    expiresAt: now + ttl,
  };
  const payloadPart = Buffer.from(JSON.stringify(payload)).toString(
    'base64url',
  );
  const signaturePart = sign(payloadPart, options.secret).toString('base64url');

  return {
    token: `${payloadPart}.${signaturePart}`,
    expiresAt: payload.expiresAt,
  };
}

export function verifyFileToken(
  options: VerifyFileTokenOptions,
): FileTokenPayload {
  if (!options.secret || !options.audience || !options.fileId) {
    throw new InvalidFileTokenError();
  }

  const parts = options.token.split('.');
  if (parts.length !== 2) {
    throw new InvalidFileTokenError();
  }

  const [payloadPart, signaturePart] = parts;
  const payloadBytes = decodeBase64Url(payloadPart);
  const suppliedSignature = decodeBase64Url(signaturePart);
  const expectedSignature = sign(payloadPart, options.secret);

  if (!signaturesMatch(expectedSignature, suppliedSignature)) {
    throw new InvalidFileTokenError();
  }

  const payload = parsePayload(payloadBytes);
  if (
    payload.audience !== options.audience ||
    payload.fileId !== options.fileId
  ) {
    throw new InvalidFileTokenError();
  }

  const now = resolveVerificationTime(options.now);
  if (payload.expiresAt <= now) {
    throw new ExpiredFileTokenError();
  }

  return payload;
}

function assertSigningInput(
  secret: string,
  audience: string,
  fileId: string,
): void {
  if (!secret) {
    throw new InvalidFileInputError('A file token secret is required.');
  }
  if (!audience.trim()) {
    throw new InvalidFileInputError('A file token audience is required.');
  }
  if (!fileId.trim()) {
    throw new InvalidFileInputError('A file ID is required.');
  }
}

function resolveTtl(value: number | undefined): number {
  const ttl = value ?? DEFAULT_FILE_TOKEN_TTL_SECONDS;
  if (
    !Number.isFinite(ttl) ||
    !Number.isInteger(ttl) ||
    ttl <= 0 ||
    ttl > MAX_FILE_TOKEN_TTL_SECONDS
  ) {
    throw new InvalidFileInputError(
      `File token TTL must be an integer between 1 and ${MAX_FILE_TOKEN_TTL_SECONDS} seconds.`,
    );
  }
  return ttl;
}

function resolveEpochSeconds(value: number | undefined, label: string): number {
  const seconds = value ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(seconds) || !Number.isInteger(seconds) || seconds < 0) {
    throw new InvalidFileInputError(
      `${label} must be a non-negative integer in epoch seconds.`,
    );
  }
  return seconds;
}

function resolveVerificationTime(value: number | undefined): number {
  try {
    return resolveEpochSeconds(value, 'Verification time');
  } catch {
    throw new InvalidFileTokenError();
  }
}

function sign(payloadPart: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payloadPart).digest();
}

function decodeBase64Url(value: string): Buffer {
  if (!value || !BASE64URL_PART.test(value)) {
    throw new InvalidFileTokenError();
  }

  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) {
    throw new InvalidFileTokenError();
  }
  return decoded;
}

function signaturesMatch(expected: Buffer, supplied: Buffer): boolean {
  const comparable = Buffer.alloc(expected.length);
  supplied.copy(comparable, 0, 0, expected.length);
  const equal = timingSafeEqual(expected, comparable);
  return equal && supplied.length === expected.length;
}

function parsePayload(bytes: Buffer): FileTokenPayload {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new InvalidFileTokenError();
  }

  if (!isPayload(value)) {
    throw new InvalidFileTokenError();
  }
  return value;
}

function isPayload(value: unknown): value is FileTokenPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const payload = value as Partial<FileTokenPayload>;
  return (
    payload.version === 1 &&
    typeof payload.audience === 'string' &&
    payload.audience.length > 0 &&
    typeof payload.fileId === 'string' &&
    payload.fileId.length > 0 &&
    typeof payload.expiresAt === 'number' &&
    Number.isInteger(payload.expiresAt) &&
    payload.expiresAt >= 0
  );
}
