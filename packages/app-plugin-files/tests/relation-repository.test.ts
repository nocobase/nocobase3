import { describe, expect, it } from 'vitest';

import type {
  CollectionBuilder,
  DatabaseConnection,
  DatabaseManager,
  InspectedCollection,
  QueryAdapter,
} from '@nocobase/database';

import { RelationBindingRepository } from '../server/internal/relation-repository.js';

describe('RelationBindingRepository', () => {
  it('rethrows the last retryable database error after exhausting attempts', async () => {
    const error = Object.assign(new Error('database is busy'), {
      code: 'SQLITE_BUSY',
    });
    const database = new FailingDatabaseManager(error);
    const repository = new RelationBindingRepository({
      database,
      collection: inspectedCollection('attachments', [
        'id',
        'recordId',
        'fileId',
        'slot',
        'reservationExpiresAt',
        'createdAt',
        'updatedAt',
      ]),
      parentCollection: inspectedCollection('records', ['id']),
      parentField: 'id',
      recordField: 'recordId',
    });

    await expect(
      repository.reserve(
        {
          id: 'reservation-1',
          recordId: 'record-1',
          fileId: 'file-1',
          reservationExpiresAt: new Date('2026-08-25T00:15:00.000Z'),
          now: new Date('2026-08-25T00:00:00.000Z'),
        },
        1,
      ),
    ).rejects.toBe(error);
    expect(database.transactionCount).toBe(3);
  });
});

class FailingDatabaseManager implements DatabaseManager {
  transactionCount = 0;

  constructor(private readonly error: Error) {}

  connection(_name?: string): DatabaseConnection {
    throw new Error('Unexpected connection access.');
  }

  builder(_name?: string): CollectionBuilder {
    throw new Error('Unexpected builder access.');
  }

  query(_name?: string): QueryAdapter {
    throw new Error('Unexpected query access.');
  }

  async connect(_name?: string): Promise<DatabaseConnection> {
    throw new Error('Unexpected connect.');
  }

  async transaction<T>(
    _fn: (connection: DatabaseConnection) => Promise<T>,
    _name?: string,
  ): Promise<T> {
    this.transactionCount += 1;
    throw this.error;
  }

  async disconnect(_name?: string): Promise<void> {}

  async reconnect(_name?: string): Promise<DatabaseConnection> {
    throw new Error('Unexpected reconnect.');
  }

  async destroy(): Promise<void> {}
}

function inspectedCollection(
  name: string,
  fieldNames: readonly string[],
): InspectedCollection {
  return {
    definition: { name },
    tableName: name,
    fields: fieldNames.map((fieldName) => ({
      definition: { name: fieldName, type: 'string' },
      columnName: fieldName,
    })),
  };
}
