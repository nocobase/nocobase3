import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

export interface CreateSealedCredentialCodecOptions {
  prefix: string;
  authenticatedContext: string;
  keyPurpose: string;
  secret: string;
  secretError: string;
  invalidCredential(): Error;
}

export interface SealedCredentialCodec {
  seal(payload: unknown): string;
  unseal(credential: string): unknown;
}

export function createSealedCredentialCodec(
  options: CreateSealedCredentialCodecOptions,
): SealedCredentialCodec {
  if (options.secret.length < 32) {
    throw new Error(options.secretError);
  }
  const key = createHash('sha256')
    .update(options.keyPurpose)
    .update('\0')
    .update(options.secret)
    .digest();
  const authenticatedContext = Buffer.from(
    options.authenticatedContext,
    'utf8',
  );

  return {
    seal(payload: unknown): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(authenticatedContext);
      const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(payload), 'utf8'),
        cipher.final(),
      ]);
      return [
        options.prefix,
        iv.toString('base64url'),
        encrypted.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
      ].join('.');
    },

    unseal(credential: string): unknown {
      try {
        const parts = credential.split('.');
        if (
          parts.length !== 4 ||
          parts[0] !== options.prefix ||
          !parts[1] ||
          !parts[2] ||
          !parts[3]
        ) {
          throw options.invalidCredential();
        }
        const iv = Buffer.from(parts[1], 'base64url');
        const encrypted = Buffer.from(parts[2], 'base64url');
        const tag = Buffer.from(parts[3], 'base64url');
        if (iv.length !== 12 || encrypted.length === 0 || tag.length !== 16) {
          throw options.invalidCredential();
        }
        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAAD(authenticatedContext);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([
          decipher.update(encrypted),
          decipher.final(),
        ]).toString('utf8');
        return JSON.parse(decrypted) as unknown;
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === options.invalidCredential().name
        ) {
          throw error;
        }
        throw options.invalidCredential();
      }
    },
  };
}
