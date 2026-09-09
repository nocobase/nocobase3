import { randomUUID } from 'node:crypto';

import type { DatabaseManager, Row } from '@nocobase/db';

import type { MailCredentialVault } from './types.js';

interface CredentialRow extends Row {
  reference: string;
  value: string;
  purpose: 'account' | 'authorization';
  expiresAt?: string | null;
  refreshLeaseToken?: string | null;
  refreshLeaseExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

const REFRESH_LEASE_MS = 2 * 60 * 1_000;
const REFRESH_POLL_MS = 50;

export class DatabaseMailCredentialVault implements MailCredentialVault {
  private readonly refreshes = new Map<string, Promise<unknown>>();

  public constructor(
    private readonly database: DatabaseManager,
    private readonly refreshLeaseMs: number = REFRESH_LEASE_MS,
    private readonly refreshPollMs: number = REFRESH_POLL_MS,
  ) {}

  public async put(
    value: unknown,
    options: {
      readonly purpose?: 'account' | 'authorization';
      readonly expiresAt?: string;
    } = {},
  ): Promise<string> {
    const reference = `mail-credential:${randomUUID()}`;
    const now = new Date().toISOString();
    await this.database
      .query()
      .insertInto<CredentialRow>('mailCredentials')
      .values({
        reference,
        value: JSON.stringify(value),
        purpose: options.purpose ?? 'account',
        expiresAt: options.expiresAt,
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
    return JSON.parse(row.value) as T;
  }

  public async replace(reference: string, value: unknown): Promise<void> {
    const result = await this.database
      .query()
      .updateTable<CredentialRow>('mailCredentials')
      .set({
        value: JSON.stringify(value),
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
              value: JSON.stringify(next),
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

  public async deleteExpired(now: string): Promise<number> {
    const result = await this.database
      .query()
      .deleteFrom<CredentialRow>('mailCredentials')
      .where('purpose', '=', 'authorization')
      .where('expiresAt', '<=', now)
      .execute();
    return result.deletedCount ?? 0;
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
): DatabaseMailCredentialVault {
  return new DatabaseMailCredentialVault(database);
}
