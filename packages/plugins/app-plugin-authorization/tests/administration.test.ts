import { fileURLToPath } from 'node:url';

import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  createMigrator,
  type DatabaseManager,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createAuthorizationAdministration,
  type AuthorizationAdministration,
} from '../server/administration.js';
import { describeCollection } from '../server/database/index.js';

describe('the records an application offers to a settings page', () => {
  let database: DatabaseManager;
  let administration: AuthorizationAdministration;

  beforeEach(async () => {
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    await createMigrator({
      database,
      packageName: '@nocobase/app-plugin-authentication',
      directory: fileURLToPath(
        new URL(
          '../../app-plugin-authentication/database/migrations',
          import.meta.url,
        ),
      ),
    }).latest();
    // The records a settings page offers come from db's own Collection
    // metadata; nothing here resolves a grant.
    const connection = database.connection();
    administration = createAuthorizationAdministration({
      connection,
      resolveCollection: (name) => describeCollection(connection, name),
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('labels each record of a registered collection', async () => {
    await createUser('alice', 'Alice');
    await createUser('bob', 'Bob');

    await expect(administration.listRecords('main.user')).resolves.toEqual([
      { id: 'alice', label: 'Alice', description: 'alice' },
      { id: 'bob', label: 'Bob', description: 'bob' },
    ]);
  });

  it('offers nothing for a collection the database does not hold', async () => {
    await expect(administration.listRecords('main.orders')).resolves.toEqual(
      [],
    );
  });

  async function createUser(id: string, name: string): Promise<void> {
    const now = new Date();
    await database
      .connection()
      .query.insertInto('user')
      .values({
        id,
        name,
        username: id,
        email: `${id}@example.com`,
        emailVerified: true,
        disabledAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }
});
