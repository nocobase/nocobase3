// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { resolve } from 'node:path';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import postgres from '@nocobase/db-postgres';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseMailStore } from '../server/store.js';
import searchMigration from '../database/migrations/202609170001_add_mail_address_search.js';
import { toMessageRow } from '../server/store/mappers.js';
import type { MailStore, NormalizedMailMessage } from '../server/types.js';

const dialects =
  process.env.MAIL_TEST_POSTGRES === '1'
    ? (['postgres'] as const)
    : (['sqlite'] as const);
describe.each(dialects)('mail queries on %s', (dialect) => {
  let database: DatabaseManager;
  let store: MailStore;
  let metadataStore: InMemoryCollectionMetadataStore;
  let dropSchema: (() => Promise<unknown>) | undefined;
  const accountId = randomUUID();
  beforeEach(async () => {
    const schema = `mail_test_${randomUUID().replaceAll('-', '')}`;
    metadataStore = new InMemoryCollectionMetadataStore();
    database = createDatabaseManager({
      metadataStore,
      connections: {
        main:
          dialect === 'sqlite'
            ? sqlite({ filename: ':memory:' })
            : postgres({
                host: process.env.PGHOST ?? '127.0.0.1',
                port: Number(process.env.PGPORT ?? 5432),
                database: process.env.PGDATABASE ?? 'postgres',
                username: process.env.PGUSER ?? userInfo().username,
                password: process.env.PGPASSWORD,
                schema,
              }),
      },
    });
    if (dialect === 'postgres') {
      const client = await database
        .connection()
        .client<{ raw(sql: string, bindings: string[]): Promise<unknown> }>();
      await client.raw('create schema ??', [schema]);
      dropSchema = () => client.raw('drop schema ?? cascade', [schema]);
    }
    await database
      .createMigrator({
        directory: resolve(import.meta.dirname, '../database/migrations'),
        packageName: '@nocobase/app-plugin-mail',
      })
      .latest();
    store = createDatabaseMailStore(database);
    await store.saveAccount({
      id: accountId,
      userId: 'owner',
      address: 'owner@example.com',
      status: 'active',
      provider: { type: 'test', name: 'test' },
      credentialReference: 'unused',
      scopes: [],
    });
    await store.commitSyncBatch({
      accountId,
      folders: ['inbox', 'second'].map((id) => ({
        providerFolderId: id,
        name: id,
        type: 'inbox' as const,
        kind: 'folder' as const,
      })),
      messages: [],
      deletedProviderMessageIds: [],
      nextCursor: { value: 'cursor' },
    });
  });
  afterEach(async () => {
    await dropSchema?.();
    dropSchema = undefined;
    await database.destroy();
  });
  const message = (id: string): NormalizedMailMessage => ({
    providerMessageId: id,
    providerFolderIds: ['inbox', 'second'],
    from: { address: 'sender@example.com', name: 'Sender Name' },
    to: [{ address: 'recipient@example.com', name: 'Recipient Name' }],
    cc: [],
    bcc: [],
    replyTo: [],
    references: [],
    subject: 'Subject',
    preview: 'Preview',
    read: false,
    starred: false,
    draft: false,
    attachments: [],
  });
  it('backfills existing JSON addresses across batches and reverses physical fields and metadata', async () => {
    const connection = database.connection();
    const context = {
      builder: connection.builder,
      query: connection.query,
      connection,
    };
    await searchMigration.down!(context);
    const rows = Array.from({ length: 101 }, (_, index) => {
      const {
        senderSearch: _sender,
        recipientsSearch: _recipients,
        ...row
      } = toMessageRow(
        accountId,
        message(`backfill-${index}`),
        randomUUID(),
        new Date().toISOString(),
        new Date().toISOString(),
      );
      return row;
    });
    for (const row of rows)
      await connection.query.insertInto('mailMessages').values(row).execute();
    await searchMigration.up(context);
    const backfilled = await connection.query
      .selectFrom('mailMessages')
      .select(['senderSearch', 'recipientsSearch'])
      .execute();
    expect(backfilled).toHaveLength(101);
    for (const row of backfilled)
      expect(row).toEqual({
        senderSearch: 'Sender Name sender@example.com',
        recipientsSearch: 'Recipient Name recipient@example.com',
      });
    expect(
      (
        await store.listMessages('owner', {
          query: 'recipient@example',
          withTotal: true,
        })
      ).total,
    ).toBe(101);
    expect(
      (await metadataStore.get('mailMessages'))?.document.fields.senderSearch,
    ).toMatchObject({ type: 'text' });
    await searchMigration.down!(context);
    expect(
      (await metadataStore.get('mailMessages'))?.document.fields.senderSearch,
    ).toBeUndefined();
    const remaining = await connection.query
      .selectFrom('mailMessages')
      .select('id')
      .execute();
    expect(remaining).toHaveLength(101);
    await expect(
      connection.query
        .selectFrom('mailMessages')
        .select('senderSearch')
        .execute(),
    ).rejects.toThrow();
  });

  it('stores missing message dates as NULL when creating and updating mail', async () => {
    const input = message('dates');
    const initial = await store.saveMessage(accountId, input);
    expect(initial.receivedAt).toBeUndefined();
    expect(initial.sentAt).toBeUndefined();
    await store.saveMessage(accountId, {
      ...input,
      receivedAt: '2026-09-17T00:00:00.000Z',
      sentAt: '2026-09-16T23:59:00.000Z',
    });
    const updated = await store.saveMessage(accountId, input);
    expect(updated.id).toBe(initial.id);
    expect(updated.receivedAt).toBeUndefined();
    expect(updated.sentAt).toBeUndefined();
    const row = await database
      .query()
      .selectFrom('mailMessages')
      .select(['receivedAt', 'sentAt', 'sortAt', 'createdAt'])
      .where('id', '=', initial.id)
      .executeTakeFirst<{
        receivedAt: string | null;
        sentAt: string | null;
        sortAt: string;
        createdAt: string;
      }>();
    expect(row).toMatchObject({ receivedAt: null, sentAt: null });
    expect(row?.sortAt).toEqual(row?.createdAt);
  });

  it('filters folders and labels without duplicate rows and keeps totals and cursors consistent', async () => {
    const first = await store.saveMessage(accountId, message('first'));
    const second = await store.saveMessage(accountId, message('second'));
    const labels = await Promise.all(
      ['one', 'two'].map((name) => store.createLabel('owner', name, 'blue')),
    );
    for (const item of [first, second])
      await store.updateMessageLabels(
        accountId,
        item.id,
        labels.map((label) => label.id),
        [],
      );
    for (const folderIds of [
      ['inbox', 'second'],
      ['__nocobase_default_inbox__'],
    ]) {
      const input = {
        folderIds,
        labelIds: labels.map((label) => label.id),
        limit: 1,
        withTotal: true,
      };
      const page = await store.listMessages('owner', input);
      expect(page.total).toBe(2);
      expect(page.items).toHaveLength(1);
      const next = await store.listMessages('owner', {
        ...input,
        cursor: page.nextCursor,
      });
      expect(next.items).toHaveLength(1);
      expect(next.items[0].id).not.toBe(page.items[0].id);
      expect(
        (await store.listAllMessages({ ...input, offset: 1 })).items[0].id,
      ).toBe(next.items[0].id);
    }
    expect((await store.listMessages('outsider', {})).items).toEqual([]);
  });
  it('keeps local drafts visible in the provider draft folder and removes synced duplicates before pagination', async () => {
    await store.saveFolder(accountId, {
      providerFolderId: 'drafts',
      name: 'Drafts',
      type: 'drafts',
      kind: 'folder',
    });
    const remote = {
      ...message('remote-draft'),
      draft: true,
      providerFolderIds: ['inbox', 'drafts'],
    };
    const editable = await store.saveMessage(accountId, remote);
    await store.localizeDraft(accountId, editable.id);
    await store.saveMessage(accountId, {
      ...remote,
      providerMessageId: `local-draft:${editable.id}`,
      providerDraftMessageId: 'remote-draft',
      providerFolderIds: ['__nocobase_local_drafts__'],
    });
    await store.saveMessage(accountId, remote);
    for (const folderIds of [['drafts'], ['__nocobase_local_drafts__']]) {
      const page = await store.listMessages('owner', {
        folderIds,
        withTotal: true,
        limit: 1,
      });
      expect(page.total).toBe(1);
      expect(page.items[0]?.id).toBe(editable.id);
      expect(page.nextCursor).toBeUndefined();
    }
    expect(
      (
        await store.listMessages('owner', {
          folderIds: ['inbox'],
          withTotal: true,
        })
      ).total,
    ).toBe(0);
  });

  it('searches address names and values alongside subject and preview after updates', async () => {
    await store.saveMessage(accountId, message('first'));
    for (const query of [
      'sender@example',
      'Sender Name',
      'recipient@example',
      'Recipient Name',
      'Subject',
      'Preview',
    ]) {
      const page = await store.listMessages('owner', {
        query,
        folderIds: ['inbox'],
        withTotal: true,
      });
      expect(page.items).toHaveLength(1);
      expect(page.total).toBe(1);
    }
    await store.saveMessage(accountId, {
      ...message('first'),
      from: { address: 'changed@example.com' },
      to: [],
    });
    expect(
      (await store.listMessages('owner', { query: 'changed@example' })).items,
    ).toHaveLength(1);
    expect(
      (await store.listMessages('owner', { query: 'recipient@example' })).items,
    ).toHaveLength(0);
  });
});
