import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';

import type { DatabaseManager, Row } from '@nocobase/db';

import type { MailCredentialVault } from './types.js';

interface CredentialRow extends Row {
  reference: string;
  ciphertext: string;
  createdAt: string;
  updatedAt: string;
}

export class DatabaseMailCredentialVault implements MailCredentialVault {
  private readonly key?: Buffer;

  public constructor(
    private readonly database: DatabaseManager,
    encryptionKey: string | undefined,
  ) {
    this.key = encryptionKey
      ? createHash('sha256').update(encryptionKey).digest()
      : undefined;
  }

  public async put(value: unknown): Promise<string> {
    const reference = `mail-credential:${randomUUID()}`;
    const now = new Date().toISOString();
    await this.database
      .query()
      .insertInto<CredentialRow>('mailCredentials')
      .values({
        reference,
        ciphertext: this.encrypt(value),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return reference;
  }

  public async get<T>(reference: string): Promise<T> {
    const row = await this.database
      .query()
      .selectFrom<CredentialRow>('mailCredentials')
      .selectAll()
      .where('reference', '=', reference)
      .executeTakeFirst<CredentialRow>();
    if (!row) throw new Error('Mail credential was not found.');
    return this.decrypt<T>(row.ciphertext);
  }

  public async replace(reference: string, value: unknown): Promise<void> {
    const result = await this.database
      .query()
      .updateTable<CredentialRow>('mailCredentials')
      .set({
        ciphertext: this.encrypt(value),
        updatedAt: new Date().toISOString(),
      })
      .where('reference', '=', reference)
      .execute();
    if (result.updatedCount !== 1) {
      throw new Error('Mail credential was not found.');
    }
  }

  public async delete(reference: string): Promise<void> {
    await this.database
      .query()
      .deleteFrom<CredentialRow>('mailCredentials')
      .where('reference', '=', reference)
      .execute();
  }

  private encrypt(value: unknown): string {
    const key = this.requireKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  private decrypt<T>(envelope: string): T {
    const key = this.requireKey();
    const [version, iv, tag, encrypted] = envelope.split('.');
    if (version !== 'v1' || !iv || !tag || !encrypted) {
      throw new Error('Mail credential envelope is invalid.');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64url')),
        decipher.final(),
      ]).toString('utf8'),
    ) as T;
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new Error(
        'mail.credentialEncryptionKey is required before connecting OAuth mail accounts.',
      );
    }
    return this.key;
  }
}

export function createDatabaseMailCredentialVault(
  database: DatabaseManager,
  encryptionKey: string | undefined,
): DatabaseMailCredentialVault {
  return new DatabaseMailCredentialVault(database, encryptionKey);
}
