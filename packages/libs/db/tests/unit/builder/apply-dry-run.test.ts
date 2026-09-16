import { describe, expect, expectTypeOf, it } from 'vitest';
import { CollectionBuilder } from '../../../src/collection/builder/builder.js';
import type { BuilderExecOptions } from '../../../src/index.js';
import { RecordingSchemaAdapter } from './helpers.js';

describe('CollectionBuilder apply and dryRun', () => {
  it('does not expose a metadata synchronization switch', () => {
    expectTypeOf<
      Extract<keyof BuilderExecOptions, 'syncMetadata'>
    >().toEqualTypeOf<never>();
  });

  it.each([
    { syncMetadata: false, dryRun: false },
    { syncMetadata: true, dryRun: false },
    { syncMetadata: false, dryRun: true },
  ])('rejects removed execution options %j before DDL', async (options) => {
    const adapter = new RecordingSchemaAdapter();
    const builder = new CollectionBuilder({ schemaAdapter: adapter });

    // JavaScript callers and existing options objects can bypass excess-property checks.
    await expect(
      builder.createCollection(
        'orders',
        (collection) => {
          collection.increments('id');
          collection.json('payload');
        },
        options,
      ),
    ).rejects.toThrow('CollectionBuilder no longer supports syncMetadata');

    expect(adapter.executed).toEqual([]);
    await expect(builder.hasCollection('orders')).resolves.toBe(false);
  });

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
