import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const PUBLIC_TOKEN_PREFIX = 'fp1_';

export function createPublicToken(): string {
  return `${PUBLIC_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function isPublicToken(value: string): boolean {
  return value.startsWith(PUBLIC_TOKEN_PREFIX);
}

export function hashPublicToken(token: string): string {
  return `sha256:${createHash('sha256').update(token).digest('hex')}`;
}

export function matchesPublicToken(
  expectedHash: string,
  token: string,
): boolean {
  const actual = Buffer.from(hashPublicToken(token), 'utf8');
  const expected = Buffer.from(expectedHash, 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
