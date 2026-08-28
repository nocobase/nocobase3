import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
  type Row,
} from '@nocobase/app-database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../database/migrations/202608270001_create_file_demo_tables.js';
import seed from '../database/seeds/202608270002_seed_file_demo.js';
import {
  FILE_DEMO_AVATAR,
  FILE_DEMO_COLLECTIONS,
  FILE_DEMO_ORDER,
  FILE_DEMO_PRIVATE_ATTACHMENT,
  FILE_DEMO_PROFILE,
  FILE_DEMO_PUBLIC_ATTACHMENT,
  FILE_DEMO_SEEDED_AT,
} from '../server/demo/constants.js';

interface RawDatabaseClient {
  raw(sql: string): Promise<unknown>;
}

describe('File Demo database schema', () => {
  let database: DatabaseManager;
  let metadataStore: InMemoryCollectionMetadataStore;

  beforeEach(async () => {
    metadataStore = new InMemoryCollectionMetadataStore();
    database = createDatabaseManager({
      default: 'main',
      metadataStore,
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });
    const client = await database.connection().client<RawDatabaseClient>();
    await client.raw('PRAGMA foreign_keys = ON');
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('creates all collections with relation, constraint, and index metadata', async () => {
    await migrateUp(database);

    for (const collectionName of Object.values(FILE_DEMO_COLLECTIONS)) {
      await expect(
        metadataStore.getCollection(collectionName),
      ).resolves.toBeDefined();
      await expect(
        database.query().selectFrom(collectionName).select('id').execute(),
      ).resolves.toEqual([]);
    }

    await expect(
      metadataStore.getCollection(FILE_DEMO_COLLECTIONS.profiles),
    ).resolves.toMatchObject({
      fields: expect.arrayContaining([
        expect.objectContaining({
          name: 'avatar',
          type: 'hasOne',
          target: FILE_DEMO_COLLECTIONS.profileAvatars,
          foreignKey: 'profileId',
        }),
      ]),
    });
    await expect(
      metadataStore.getCollection(FILE_DEMO_COLLECTIONS.profileAvatars),
    ).resolves.toMatchObject({
      fields: expect.arrayContaining([
        expect.objectContaining({
          name: 'profile',
          type: 'belongsTo',
          constraints: true,
        }),
      ]),
      constraints: expect.arrayContaining([
        expect.objectContaining({
          type: 'unique',
          fields: ['profileId'],
        }),
        expect.objectContaining({
          type: 'unique',
          fields: ['disk', 'key'],
        }),
      ]),
    });
    await expect(
      metadataStore.getCollection(FILE_DEMO_COLLECTIONS.orders),
    ).resolves.toMatchObject({
      fields: expect.arrayContaining([
        expect.objectContaining({
          name: 'attachments',
          type: 'hasMany',
          target: FILE_DEMO_COLLECTIONS.orderAttachments,
          foreignKey: 'orderId',
        }),
      ]),
    });
    await expect(
      metadataStore.getCollection(FILE_DEMO_COLLECTIONS.orderAttachments),
    ).resolves.toMatchObject({
      fields: expect.arrayContaining([
        expect.objectContaining({
          name: 'order',
          type: 'belongsTo',
          constraints: true,
        }),
      ]),
      constraints: expect.arrayContaining([
        expect.objectContaining({
          type: 'unique',
          fields: ['disk', 'key'],
        }),
      ]),
      indexes: expect.arrayContaining([
        expect.objectContaining({ fields: ['orderId'] }),
      ]),
    });
  });

  it('enforces one avatar, multiple order attachments, and per-table object uniqueness', async () => {
    await migrateUp(database);
    await insertParents(database);
    const now = new Date();
    const avatar = fileRow(FILE_DEMO_AVATAR, now);
    await database
      .query()
      .insertInto(FILE_DEMO_COLLECTIONS.profileAvatars)
      .values({ ...avatar, profileId: FILE_DEMO_PROFILE.id })
      .execute();
    await expect(
      database
        .query()
        .insertInto(FILE_DEMO_COLLECTIONS.profileAvatars)
        .values({
          ...avatar,
          id: 'second-avatar',
          key: 'file-demo/profile/second-avatar.png',
          profileId: FILE_DEMO_PROFILE.id,
        })
        .execute(),
    ).rejects.toThrow(/unique/i);

    const publicAttachment = fileRow(FILE_DEMO_PUBLIC_ATTACHMENT, now);
    const privateAttachment = fileRow(FILE_DEMO_PRIVATE_ATTACHMENT, now);
    await database
      .query()
      .insertInto(FILE_DEMO_COLLECTIONS.orderAttachments)
      .values([
        { ...publicAttachment, orderId: FILE_DEMO_ORDER.id },
        { ...privateAttachment, orderId: FILE_DEMO_ORDER.id },
      ])
      .execute();
    await expect(
      database
        .query()
        .selectFrom(FILE_DEMO_COLLECTIONS.orderAttachments)
        .select('id')
        .where('orderId', '=', FILE_DEMO_ORDER.id)
        .execute(),
    ).resolves.toHaveLength(2);
    await expect(
      database
        .query()
        .insertInto(FILE_DEMO_COLLECTIONS.orderAttachments)
        .values({
          ...publicAttachment,
          id: 'duplicate-order-object',
          orderId: FILE_DEMO_ORDER.id,
        })
        .execute(),
    ).rejects.toThrow(/unique/i);

    await expect(
      database
        .query()
        .insertInto(FILE_DEMO_COLLECTIONS.orderAttachments)
        .values({
          ...privateAttachment,
          id: 'missing-order-attachment',
          key: 'file-demo/orders/missing-order.txt',
          orderId: 999,
        })
        .execute(),
    ).rejects.toThrow(/foreign key/i);

    await database
      .query()
      .insertInto(FILE_DEMO_COLLECTIONS.profileAvatars)
      .values({
        ...publicAttachment,
        id: 'same-object-in-avatar-table',
        profileId: 2,
      })
      .execute();
  });

  it('seeds only Demo business entities and remains safe when run repeatedly', async () => {
    await migrateUp(database);
    const connection = database.connection();
    const context = { query: connection.query, connection };
    await seed.run(context);
    await seed.run(context);

    await expect(
      database
        .query()
        .selectFrom(FILE_DEMO_COLLECTIONS.profiles)
        .select(['id', 'name', 'createdAt', 'updatedAt'])
        .execute(),
    ).resolves.toEqual([
      {
        ...FILE_DEMO_PROFILE,
        createdAt: FILE_DEMO_SEEDED_AT,
        updatedAt: FILE_DEMO_SEEDED_AT,
      },
    ]);
    await expect(
      database
        .query()
        .selectFrom(FILE_DEMO_COLLECTIONS.orders)
        .select(['id', 'number', 'createdAt', 'updatedAt'])
        .execute(),
    ).resolves.toEqual([
      {
        ...FILE_DEMO_ORDER,
        createdAt: FILE_DEMO_SEEDED_AT,
        updatedAt: FILE_DEMO_SEEDED_AT,
      },
    ]);
    await expect(
      database
        .query()
        .selectFrom(FILE_DEMO_COLLECTIONS.profileAvatars)
        .select([
          'id',
          'profileId',
          'disk',
          'key',
          'filename',
          'mimeType',
          'size',
          'public',
          'createdAt',
          'updatedAt',
        ])
        .execute(),
    ).resolves.toEqual([]);
    await expect(
      database
        .query()
        .selectFrom(FILE_DEMO_COLLECTIONS.orderAttachments)
        .select([
          'id',
          'orderId',
          'disk',
          'key',
          'filename',
          'mimeType',
          'size',
          'public',
          'createdAt',
          'updatedAt',
        ])
        .orderBy('id')
        .execute(),
    ).resolves.toEqual([]);
  });

  it('drops all Demo collections and metadata', async () => {
    await migrateUp(database);
    const connection = database.connection();
    const droppedCollections: string[] = [];
    const dropCollection = connection.builder.dropCollection.bind(
      connection.builder,
    );
    connection.builder.dropCollection = async (name, options) => {
      droppedCollections.push(name);
      return dropCollection(name, options);
    };
    await migration.down?.({
      builder: connection.builder,
      query: connection.query,
      connection,
    });

    expect(droppedCollections).toEqual([
      FILE_DEMO_COLLECTIONS.orderAttachments,
      FILE_DEMO_COLLECTIONS.orders,
      FILE_DEMO_COLLECTIONS.profileAvatars,
      FILE_DEMO_COLLECTIONS.profiles,
    ]);

    for (const collectionName of Object.values(FILE_DEMO_COLLECTIONS)) {
      await expect(
        metadataStore.getCollection(collectionName),
      ).resolves.toBeUndefined();
      await expect(
        database.query().selectFrom(collectionName).select('id').execute(),
      ).rejects.toThrow(/no such table/i);
    }
  });
});

async function migrateUp(database: DatabaseManager): Promise<void> {
  const connection = database.connection();
  await migration.up({
    builder: connection.builder,
    query: connection.query,
    connection,
  });
}

async function insertParents(database: DatabaseManager): Promise<void> {
  const now = new Date();
  await database
    .query()
    .insertInto(FILE_DEMO_COLLECTIONS.profiles)
    .values([
      { ...FILE_DEMO_PROFILE, createdAt: now, updatedAt: now },
      { id: 2, name: 'Second Profile', createdAt: now, updatedAt: now },
    ])
    .execute();
  await database
    .query()
    .insertInto(FILE_DEMO_COLLECTIONS.orders)
    .values({ ...FILE_DEMO_ORDER, createdAt: now, updatedAt: now })
    .execute();
}

function fileRow(
  file: Readonly<{
    id: string;
    disk: string;
    key: string;
    filename: string;
    mimeType: string;
    size: number;
    public: boolean;
  }>,
  now: Date,
): Row {
  return { ...file, disk: 'test-disk', createdAt: now, updatedAt: now };
}
