import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  findRegisteredDatabaseFileSource,
  listRegisteredDatabaseFileSources,
  registerDatabaseFileSource,
} from '../../server/settings/source-registry.js';

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

  it('groups registrations by database and table', () => {
    registerDatabaseFileSource({
      database,
      table: 'orderAttachments',
    });
    registerDatabaseFileSource({
      database,
      table: 'orderAttachments',
    });

    expect(listRegisteredDatabaseFileSources(database)).toEqual([
      {
        id: 'orderAttachments',
        table: 'orderAttachments',
      },
    ]);
    expect(
      findRegisteredDatabaseFileSource(database, 'orderAttachments'),
    ).toEqual({ id: 'orderAttachments', table: 'orderAttachments' });
  });
});
