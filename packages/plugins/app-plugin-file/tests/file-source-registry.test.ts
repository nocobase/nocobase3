import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  findRegisteredDatabaseFileSource,
  listRegisteredDatabaseFileSources,
  registerDatabaseFileSource,
} from '../server/file-source-registry.js';

describe('file source registry', () => {
  let database: DatabaseManager;

  beforeEach(() => {
    database = createDatabaseManager({
      default: 'main',
      connections: {
        main: { dialect: 'sqlite', filename: ':memory:' },
      },
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('groups registrations by database, base path, and table', () => {
    registerDatabaseFileSource({
      database,
      table: 'orderAttachments',
      publicBasePath: '/main/',
      audience: 'active-orders',
      scoped: true,
    });
    registerDatabaseFileSource({
      database,
      table: 'orderAttachments',
      publicBasePath: 'main',
      audience: 'archived-orders',
      scoped: false,
    });

    expect(listRegisteredDatabaseFileSources(database, '/main')).toEqual([
      {
        id: 'orderAttachments',
        table: 'orderAttachments',
        publicBasePath: '/main',
        audiences: ['active-orders', 'archived-orders'],
        registrations: 2,
        scoped: true,
      },
    ]);
    expect(
      findRegisteredDatabaseFileSource(database, '/main', 'orderAttachments'),
    ).toMatchObject({ registrations: 2 });
    expect(listRegisteredDatabaseFileSources(database, '/other')).toEqual([]);
  });
});
