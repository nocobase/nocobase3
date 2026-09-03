import { describe, expect, it } from 'vitest';
import { CollectionBuilder } from '../../../src/index.js';
import { RecordingSchemaAdapter } from './helpers.js';

describe('CollectionBuilder apply and dryRun', () => {
  it('does not execute schema operations or metadata sync during dryRun', async () => {
    const adapter = new RecordingSchemaAdapter([
      'alter table orders add column paid_at timestamp',
    ]);
    const builder = new CollectionBuilder({
      schemaAdapter: adapter,
    });

    const result = await builder.apply(
      [
        {
          type: 'addField',
          collection: 'orders',
          field: {
            name: 'paidAt',
            type: 'datetime',
          },
        },
      ],
      {
        dryRun: true,
        previewSql: true,
      },
    );

    expect(adapter.executed).toEqual([]);
    expect(result.sql).toEqual([
      'alter table orders add column paid_at timestamp',
    ]);
  });

  it('executes schema operations by default', async () => {
    const adapter = new RecordingSchemaAdapter();
    const builder = new CollectionBuilder({
      schemaAdapter: adapter,
    });

    await builder.apply([
      {
        type: 'createCollection',
        name: 'orders',
        definition: {
          fields: [
            {
              name: 'id',
              type: 'increments',
              primaryKey: true,
            },
          ],
        },
      },
    ]);

    expect(adapter.executed).toHaveLength(1);
    expect(adapter.executed[0][0]).toMatchObject({
      type: 'createTable',
      table: {
        name: 'orders',
      },
    });
  });

  it('marks destructive operations in impact output', async () => {
    const builder = new CollectionBuilder();

    const result = await builder.apply(
      [
        {
          type: 'dropField',
          collection: 'users',
          field: 'name',
        },
        {
          type: 'dropCollection',
          collection: 'legacyLogs',
        },
      ],
      { dryRun: true },
    );

    expect(result.impact).toEqual([
      {
        level: 'destructive',
        operation: 'dropField',
        message: 'Dropping field users.name may remove existing data.',
      },
      {
        level: 'destructive',
        operation: 'dropCollection',
        message:
          'Dropping collection legacyLogs may remove the backing database object.',
      },
    ]);
  });
});
