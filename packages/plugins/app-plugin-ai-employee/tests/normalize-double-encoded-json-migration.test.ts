import sqlite from '@nocobase/db-sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';

import createMigration from '../database/migrations/202608260002_create_ai_employee.js';
import normalizeJsonMigration from '../database/migrations/202609130001_normalize_double_encoded_json.js';

const managers: DatabaseManager[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((database) => database.destroy()));
});

type MigrationContext = Parameters<typeof normalizeJsonMigration.up>[0];

async function setup(): Promise<MigrationContext> {
  const database = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    metadataStore: new InMemoryCollectionMetadataStore(),
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  managers.push(database);
  await database.connect();
  const connection = database.connection();
  const context = {
    builder: database.builder(),
    query: connection.query,
    connection,
  } as MigrationContext;
  await createMigration.up(context);
  return context;
}

/**
 * The plugin serialized a value and the Query layer serialized it again, so a
 * historical row holds the JSON text as a JSON string. Writing that string
 * through Query reproduces exactly what those rows look like today.
 */
function doubleEncoded(value: unknown): string {
  return JSON.stringify(value);
}

describe('double-encoded JSON normalization migration', () => {
  it('unwraps the extra encoding layer and leaves correct rows alone', async () => {
    const context = await setup();

    // One statement each: a bulk insert writes a uniform column list, so an
    // omitted column becomes an explicit NULL rather than taking the default.
    // Written by the plugin: one layer too many.
    await context.query
      .insertInto('llmServices')
      .values({
        name: 'wrapped',
        enabledModels: doubleEncoded({ mode: 'provider', models: [] }),
        modelOptions: doubleEncoded({ temperature: 1 }),
        options: doubleEncoded({ apiKey: 'k' }),
      })
      .execute();
    // Written by the database default: already correct.
    await context.query
      .insertInto('llmServices')
      .values({ name: 'defaulted' })
      .execute();

    await normalizeJsonMigration.up(context);

    const rows = await context.query
      .selectFrom('llmServices')
      .select(['name', 'enabledModels', 'modelOptions', 'options'])
      .orderBy('name')
      .execute();

    expect(rows).toEqual([
      {
        name: 'defaulted',
        enabledModels: { mode: 'provider', models: [] },
        modelOptions: expect.any(Object),
        options: null,
      },
      {
        name: 'wrapped',
        enabledModels: { mode: 'provider', models: [] },
        modelOptions: { temperature: 1 },
        options: { apiKey: 'k' },
      },
    ]);
  });

  it('unwraps values that are themselves JSON strings', async () => {
    const context = await setup();

    // `content` is typed unknown and a tool may legitimately return a string.
    // Double encoding still puts exactly one removable layer on top of it.
    await context.query
      .insertInto('aiToolMessages')
      .values([
        {
          id: 1,
          messageId: 1,
          sessionId: '00000000-0000-0000-0000-000000000001',
          toolCallId: 'call-1',
          toolName: 'echo',
          status: 'success',
          content: doubleEncoded('done'),
        },
        {
          id: 2,
          messageId: 2,
          sessionId: '00000000-0000-0000-0000-000000000002',
          toolCallId: 'call-2',
          toolName: 'echo',
          status: 'success',
          content: doubleEncoded({ text: 'done' }),
        },
      ])
      .execute();

    await normalizeJsonMigration.up(context);

    expect(
      await context.query
        .selectFrom('aiToolMessages')
        .select(['id', 'content'])
        .orderBy('id')
        .execute(),
    ).toEqual([
      { id: '1', content: 'done' },
      { id: '2', content: { text: 'done' } },
    ]);
  });

  it('addresses rows by a composite key', async () => {
    const context = await setup();

    await context.query
      .insertInto('lcCheckpoints')
      .values([
        {
          threadId: 't1',
          checkpointNs: '',
          checkpointId: 'c1',
          checkpoint: doubleEncoded({ step: 1 }),
          metadata: doubleEncoded({ source: 'input' }),
        },
        {
          threadId: 't1',
          checkpointNs: '',
          checkpointId: 'c2',
          checkpoint: doubleEncoded({ step: 2 }),
          metadata: doubleEncoded({ source: 'loop' }),
        },
      ])
      .execute();

    await normalizeJsonMigration.up(context);

    expect(
      await context.query
        .selectFrom('lcCheckpoints')
        .select(['checkpointId', 'checkpoint', 'metadata'])
        .orderBy('checkpointId')
        .execute(),
    ).toEqual([
      {
        checkpointId: 'c1',
        checkpoint: { step: 1 },
        metadata: { source: 'input' },
      },
      {
        checkpointId: 'c2',
        checkpoint: { step: 2 },
        metadata: { source: 'loop' },
      },
    ]);
  });

  it('is idempotent once the extra layer is gone', async () => {
    const context = await setup();

    await context.query
      .insertInto('llmServices')
      .values({
        name: 'wrapped',
        enabledModels: doubleEncoded({ mode: 'provider', models: [] }),
      })
      .execute();

    await normalizeJsonMigration.up(context);
    const once = await context.query
      .selectFrom('llmServices')
      .select(['name', 'enabledModels'])
      .execute();

    await normalizeJsonMigration.up(context);
    expect(
      await context.query
        .selectFrom('llmServices')
        .select(['name', 'enabledModels'])
        .execute(),
    ).toEqual(once);
  });
});
