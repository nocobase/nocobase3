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
import {
  appAuthorizationDatabase,
  createAppAuthorization,
} from '../server/authorization.js';
import { databaseAuthorization } from '../server/database/index.js';

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
    // The records a settings page offers come from the collections the
    // database plugin registers; nothing here resolves a grant.
    const authorization = createAppAuthorization({
      connection: database.connection(),
      config: { plugins: [databaseAuthorization({ source: 'main' })] },
    });
    const collections = appAuthorizationDatabase(authorization)?.collections;
    if (!collections) {
      throw new Error(
        'The plugin list under test installs the database plugin',
      );
    }
    collections.add({
      name: 'user',
      actions: ['read'],
      fields: ['id', 'name', 'email'],
    });
    administration = createAuthorizationAdministration({
      connection: database.connection(),
      resolveCollection: (name) => collections.get(name),
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

  it('offers nothing for a collection the application never registered', async () => {
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
