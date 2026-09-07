import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDatabaseManager,
  createMigrator,
  type DatabaseManager,
} from '@nocobase/db';
import { RepositoryFactory } from '../server/repository/database/factory.js';

const managers: DatabaseManager[] = [];

async function createDatabase(): Promise<DatabaseManager> {
  const database = createDatabaseManager({
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  managers.push(database);
  await database.connect();
  const builder = database.builder();
  await builder.createCollection('user', (collection) => {
    collection.string('id').notNull();
    collection.primary('id');
  });
  await builder.createCollection('roles', (collection) => {
    collection.string('name').notNull();
    collection.boolean('allowNewAiEmployee').nullable();
    collection.primary('name');
  });
  const migrator = createMigrator({
    database,
    packageName: '@nocobase/app-plugin-ai-employee',
    directory: fileURLToPath(
      new URL('../database/migrations', import.meta.url),
    ),
  });
  await migrator.latest();
  return database;
}

afterEach(async () => {
  await Promise.all(managers.splice(0).map((database) => database.destroy()));
});

describe('native AI employee persistence', () => {
  it('creates native tables and shares records across repository factories', async () => {
    const database = await createDatabase();
    const first = new RepositoryFactory({ connection: database.connection() });
    const second = new RepositoryFactory({ connection: database.connection() });
    await first.aiEmployees.create({
      values: {
        username: 'nathan',
        nickname: 'Nathan',
        description: 'Developer assistant',
        enabled: true,
        builtIn: true,
        category: 'developer',
        deprecated: false,
        enableKnowledgeBase: false,
      },
    });
    await first.usersAiEmployees.create({
      values: {
        userId: 'user-1',
        aiEmployee: 'nathan',
        prompt: 'Keep answers concise',
      },
    });
    await first.aiConversations.create({
      values: {
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        aiEmployeeUsername: 'nathan',
        thread: 1,
        read: true,
      },
    });
    await first.aiMessages.create({
      values: {
        messageId: '9007199254740993',
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        role: 'assistant',
        content: { type: 'text', content: 'hello' },
      },
    });
    expect(
      await second.aiEmployees.findOne({ filter: { username: 'nathan' } }),
    ).toMatchObject({
      nickname: 'Nathan',
      description: 'Developer assistant',
    });
    expect(
      await second.aiMessages.find({
        filter: { sessionId: '123e4567-e89b-12d3-a456-426614174000' },
        sort: ['-messageId'],
      }),
    ).toHaveLength(1);
    expect(
      await second.aiMessages.findOne({
        filter: { messageId: '9007199254740993' },
      }),
    ).toMatchObject({ content: { type: 'text', content: 'hello' } });
  });

  it('sorts AI employee lists by sort ascending by default', async () => {
    const database = await createDatabase();
    const repositories = new RepositoryFactory({
      connection: database.connection(),
    });
    await repositories.aiEmployees.create({
      values: [
        {
          username: 'third',
          sort: 30,
          skillSettings: { skills: [], tools: [] },
        },
        {
          username: 'first',
          sort: 10,
          skillSettings: { skills: [], tools: [] },
        },
        {
          username: 'second',
          sort: 20,
          skillSettings: { skills: [], tools: [] },
        },
      ],
    });

    await expect(repositories.aiEmployees.find()).resolves.toMatchObject([
      { username: 'first', sort: 10 },
      { username: 'second', sort: 20 },
      { username: 'third', sort: 30 },
    ]);
  });

  it('round-trips plain-text values stored in JSON tool-message content', async () => {
    const database = await createDatabase();
    const repositories = new RepositoryFactory({
      connection: database.connection(),
    });
    const toolMessage = await repositories.aiToolMessages.create({
      values: {
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        messageId: '9007199254740993',
        toolCallId: 'tool-call-1',
        toolName: 'exampleTool',
        invokeStatus: 'pending',
      },
    });
    const content =
      'The user ignored the application for tools usage and continued asking questions';
    const invokeStartTime = new Date('2026-08-26T02:17:53.814+08:00');
    const invokeEndTime = '2026-08-26T02:17:54.814+08:00';

    await repositories.aiToolMessages.update({
      values: {
        invokeStatus: 'confirmed',
        status: 'success',
        content,
        invokeStartTime,
        invokeEndTime,
      },
      filter: { id: toolMessage.id, invokeStatus: 'pending' },
    });

    await expect(
      repositories.aiToolMessages.findOne({ filter: { id: toolMessage.id } }),
    ).resolves.toMatchObject({
      invokeStatus: 'confirmed',
      status: 'success',
      content,
      invokeStartTime: invokeStartTime.getTime(),
      invokeEndTime: Date.parse(invokeEndTime),
    });
  });

  it('round-trips array-backed JSON fields used by LLM service configuration', async () => {
    const database = await createDatabase();
    const repositories = new RepositoryFactory({
      connection: database.connection(),
    });
    await repositories.llmServices.create({
      values: {
        name: 'openai',
        title: 'OpenAI',
        provider: 'openai',
        options: { apiKey: 'secret' },
        enabledModels: ['gpt-4o', 'gpt-4.1'],
        enabled: true,
        sort: 0,
      },
    });

    await expect(
      repositories.llmServices.findOne({ filter: { name: 'openai' } }),
    ).resolves.toMatchObject({
      options: { apiKey: 'secret' },
      enabledModels: ['gpt-4o', 'gpt-4.1'],
    });
  });

  it('rolls back transaction-bound repository writes', async () => {
    const database = await createDatabase();
    const repositories = new RepositoryFactory({
      connection: database.connection(),
    });
    await expect(
      database.transaction(async (connection) => {
        await repositories.aiEmployees.create(
          {
            values: {
              username: 'rollback',
              enabled: true,
              builtIn: false,
              category: 'business',
              deprecated: false,
              enableKnowledgeBase: false,
            },
          },
          { connection },
        );
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(
      await repositories.aiEmployees.findOne({
        filter: { username: 'rollback' },
      }),
    ).toBeNull();
  });

  it('round-trips checkpoint blobs without a JSON record store', async () => {
    const database = await createDatabase();
    const repositories = new RepositoryFactory({
      connection: database.connection(),
    });
    const blob = Uint8Array.from([0, 1, 2, 255]);
    await repositories.lcCheckpointBlobs.create({
      values: {
        threadId: 'thread',
        checkpointNs: '',
        channel: 'messages',
        version: '1',
        type: 'bytes',
        blob,
      },
    });
    const restored = await repositories.lcCheckpointBlobs.findOne({
      filter: {
        threadId: 'thread',
        checkpointNs: '',
        channel: 'messages',
        version: '1',
      },
    });
    expect(Array.from(restored?.blob as Uint8Array)).toEqual([0, 1, 2, 255]);
  });
});
