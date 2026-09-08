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
  refreshLeaseToken?: string | null;
  refreshLeaseExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

const REFRESH_LEASE_MS = 2 * 60 * 1_000;
const REFRESH_POLL_MS = 50;

export class DatabaseMailCredentialVault implements MailCredentialVault {
  private readonly key?: Buffer;
  private readonly refreshes = new Map<string, Promise<unknown>>();

  public constructor(
    private readonly database: DatabaseManager,
    encryptionKey: string | undefined,
    private readonly refreshLeaseMs: number = REFRESH_LEASE_MS,
    private readonly refreshPollMs: number = REFRESH_POLL_MS,
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

  public async getOrRefresh<T>(
    reference: string,
    isFresh: (value: T) => boolean,
    refresh: (value: T) => Promise<T>,
  ): Promise<T> {
    const current = await this.get<T>(reference);
    if (isFresh(current)) return current;

    const active = this.refreshes.get(reference) as Promise<T> | undefined;
    if (active) return active;

    const pending = (async () => {
      const latest = await this.get<T>(reference);
      if (isFresh(latest)) return latest;
      return this.refreshWithLease(reference, isFresh, refresh);
    })();
    this.refreshes.set(reference, pending);
    try {
      return await pending;
    } finally {
      if (this.refreshes.get(reference) === pending) {
        this.refreshes.delete(reference);
      }
    }
  }

  private async refreshWithLease<T>(
    reference: string,
    isFresh: (value: T) => boolean,
    refresh: (value: T) => Promise<T>,
  ): Promise<T> {
    const leaseToken = randomUUID();
    while (true) {
      const current = await this.get<T>(reference);
      if (isFresh(current)) return current;

      const now = new Date();
      const claimed = await this.database
        .query()
        .updateTable<CredentialRow>('mailCredentials')
        .set({
          refreshLeaseToken: leaseToken,
          refreshLeaseExpiresAt: new Date(
            now.getTime() + this.refreshLeaseMs,
          ).toISOString(),
        })
        .where('reference', '=', reference)
        .where((builder) =>
          builder.or([
            builder.eb('refreshLeaseToken', 'is', null),
            builder.eb('refreshLeaseExpiresAt', '<=', now.toISOString()),
          ]),
        )
        .execute();
      if (claimed.updatedCount !== 1) {
        await delay(this.refreshPollMs);
        continue;
      }

      try {
        const claimedCurrent = await this.get<T>(reference);
        if (isFresh(claimedCurrent)) {
          await this.releaseRefreshLease(reference, leaseToken);
          return claimedCurrent;
        }
        const heartbeatController = new AbortController();
        let heartbeatError: Error | undefined;
        const heartbeat = this.maintainRefreshLease(
          reference,
          leaseToken,
          heartbeatController.signal,
        ).catch((error: unknown) => {
          heartbeatError =
            error instanceof Error
              ? error
              : new Error('Mail credential refresh lease renewal failed.');
        });
        try {
          const next = await refresh(claimedCurrent);
          if (heartbeatError) throw heartbeatError;
          const saved = await this.database
            .query()
            .updateTable<CredentialRow>('mailCredentials')
            .set({
              ciphertext: this.encrypt(next),
              refreshLeaseToken: null,
              refreshLeaseExpiresAt: null,
              updatedAt: new Date().toISOString(),
            })
            .where('reference', '=', reference)
            .where('refreshLeaseToken', '=', leaseToken)
            .execute();
          if (saved.updatedCount !== 1) {
            throw new Error('Mail credential refresh lease was lost.');
          }
          return next;
        } finally {
          heartbeatController.abort();
          await heartbeat;
        }
      } catch (error) {
        await this.releaseRefreshLease(reference, leaseToken);
        throw error;
      }
    }
  }

  private async maintainRefreshLease(
    reference: string,
    leaseToken: string,
    signal: AbortSignal,
  ): Promise<void> {
    while (!signal.aborted) {
      await delay(this.refreshLeaseMs / 3, signal);
      if (signal.aborted) return;
      const renewed = await this.database
        .query()
        .updateTable<CredentialRow>('mailCredentials')
        .set({
          refreshLeaseExpiresAt: new Date(
            Date.now() + this.refreshLeaseMs,
          ).toISOString(),
        })
        .where('reference', '=', reference)
        .where('refreshLeaseToken', '=', leaseToken)
        .execute();
      if (renewed.updatedCount !== 1) {
        throw new Error('Mail credential refresh lease was lost.');
      }
    }
  }

  private async releaseRefreshLease(
    reference: string,
    leaseToken: string,
  ): Promise<void> {
    await this.database
      .query()
      .updateTable<CredentialRow>('mailCredentials')
      .set({ refreshLeaseToken: null, refreshLeaseExpiresAt: null })
      .where('reference', '=', reference)
      .where('refreshLeaseToken', '=', leaseToken)
      .execute();
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

async function delay(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(finish, milliseconds);
    signal?.addEventListener('abort', finish, { once: true });
    function finish(): void {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    }
  });
}

export function createDatabaseMailCredentialVault(
  database: DatabaseManager,
  encryptionKey: string | undefined,
): DatabaseMailCredentialVault {
  return new DatabaseMailCredentialVault(database, encryptionKey);
}
