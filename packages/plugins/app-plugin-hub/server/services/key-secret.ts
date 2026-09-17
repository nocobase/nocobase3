import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { assertSecretIsNotPlaceholder } from '@nocobase/app-server/config';

// This recoverable copy belongs to Hub. Authentication still uses the API Keys plugin's hash.
function encryptionKey(secret: string | undefined): Buffer {
  assertSecretIsNotPlaceholder(secret, 'auth.secret');
  if (!secret || secret.length < 32)
    throw new Error(
      'A stable auth.secret of at least 32 characters is required to store Hub keys.',
    );
  return Buffer.from(
    hkdfSync(
      'sha256',
      secret,
      'nocobase-hub',
      'publishing-key-recovery-v1',
      32,
    ),
  );
}

export function encryptKey(
  secret: string,
  id: string,
  owner: string,
  masterSecret: string | undefined,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(masterSecret), iv);
  cipher.setAAD(Buffer.from(JSON.stringify([id, owner])));
  const encrypted = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptKey(
  value: string,
  id: string,
  owner: string,
  masterSecret: string | undefined,
): string {
  const [version, iv, tag, encrypted, extra] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !encrypted || extra !== undefined)
    throw new Error('Invalid encrypted Hub key.');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(masterSecret),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAAD(Buffer.from(JSON.stringify([id, owner])));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
