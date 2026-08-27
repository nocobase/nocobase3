import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { SettingsError } from './errors.js';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

export interface SettingsSecretBox {
  encrypt(value: string): string;
  decrypt(value: string): string;
}

export function createSettingsSecretBox(
  rawKey: string | undefined,
): SettingsSecretBox | undefined {
  const key = rawKey?.trim();
  if (!key) return undefined;
  if (key.length < 32) {
    throw new SettingsError('HUB_SETTINGS_ENCRYPTION_KEY 至少需要 32 个字符', {
      status: 500,
      code: 'SETTINGS_ENCRYPTION_KEY_TOO_SHORT',
    });
  }

  const derivedKey = createHash('sha256').update(key).digest();
  return {
    encrypt(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv(ALGORITHM, derivedKey, iv);
      const ciphertext = Buffer.concat([
        cipher.update(value, 'utf8'),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();
      return [
        VERSION,
        iv.toString('base64url'),
        tag.toString('base64url'),
        ciphertext.toString('base64url'),
      ].join(':');
    },
    decrypt(value) {
      const [version, encodedIv, encodedTag, encodedCiphertext] =
        value.split(':');
      if (
        version !== VERSION ||
        !encodedIv ||
        !encodedTag ||
        !encodedCiphertext
      ) {
        throw new SettingsError('存储配置密钥格式无效', {
          status: 500,
          code: 'SETTINGS_SECRET_FORMAT_INVALID',
        });
      }

      try {
        const decipher = createDecipheriv(
          ALGORITHM,
          derivedKey,
          Buffer.from(encodedIv, 'base64url'),
        );
        decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
        return Buffer.concat([
          decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
          decipher.final(),
        ]).toString('utf8');
      } catch (error) {
        throw new SettingsError('存储配置密钥无法解密', {
          status: 500,
          code: 'SETTINGS_SECRET_DECRYPT_FAILED',
          cause: error,
        });
      }
    },
  };
}
