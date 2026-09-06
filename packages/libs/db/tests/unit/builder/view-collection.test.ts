import { describe, expect, it } from 'vitest';
import { CollectionBuilder } from '../../../src/collection/builder/builder.js';
import { RecordingSchemaAdapter } from './helpers.js';

describe('CollectionBuilder view collections', () => {
  it('creates view collections from structured query DSL', async () => {
    const builder = new CollectionBuilder();

    const result = await builder.createViewCollection(
      'usersView',
      (view) => {
        view.title('Adult users');
        view.description('Users older than 18.');
        view.string('firstName');
        view.as((query) =>
          query.from('users').select('firstName').where('age', '>', 18),
        );
      },
      { dryRun: true },
    );

    expect(result.operations[0]).toMatchObject({
      type: 'createViewCollection',
      name: 'usersView',
      definition: {
        kind: 'view',
        title: 'Adult users',
        description: 'Users older than 18.',
      },
    });
    expect(result.schemaOperations?.[0]).toMatchObject({
      type: 'createView',
      view: {
        name: 'users_view',
        columns: ['first_name'],
        query: {
          from: 'users',
          select: ['first_name'],
          filter: {
            age: {
              $gt: 18,
            },
          },
        },
      },
    });
  });

  it('replaces view collections and supports raw SQL as an escape hatch', async () => {
    const builder = new CollectionBuilder();

    const result = await builder.replaceViewCollection(
      'usersView',
      (view) => {
        view.string('firstName');
        view.asRaw('select first_name from users where age > ?', [18]);
      },
      { dryRun: true },
    );

    expect(result.operations[0]).toMatchObject({
      type: 'replaceViewCollection',
      definition: {
        kind: 'view',
        view: {
          asRaw: {
            sql: 'select first_name from users where age > ?',
            bindings: [18],
          },
        },
      },
    });
    expect(result.schemaOperations?.[0]).toMatchObject({
      type: 'createView',
      orReplace: true,
      view: {
        raw: {
          sql: 'select first_name from users where age > ?',
          bindings: [18],
        },
      },
    });
  });

  it('creates and refreshes materialized view collections', async () => {
    const builder = new CollectionBuilder();

    const createResult = await builder.createMaterializedViewCollection(
      'usersSnapshot',
      (view) => {
        view.string('firstName');
        view.as((query) =>
          query.from('users').select('firstName').where('age', '>', 18),
        );
        view.refresh({ strategy: 'manual' });
        view.index(['firstName'], { name: 'idx_users_snapshot_first_name' });
      },
      { dryRun: true },
    );

    expect(createResult.operations[0]).toMatchObject({
      type: 'createMaterializedViewCollection',
      definition: {
        kind: 'materializedView',
        view: {
          refresh: {
            strategy: 'manual',
          },
        },
      },
    });
    expect(createResult.schemaOperations?.[0]).toMatchObject({
      type: 'createView',
      materialized: true,
      view: {
        indexes: [
          {
            columns: ['first_name'],
            name: 'idx_users_snapshot_first_name',
          },
        ],
      },
    });

    const refreshResult = await builder.refreshMaterializedViewCollection(
      'usersSnapshot',
      {
        concurrently: true,
        dryRun: true,
      },
    );

    expect(refreshResult.operations).toEqual([
      {
        type: 'refreshMaterializedViewCollection',
        collection: 'usersSnapshot',
        concurrently: true,
      },
    ]);
    expect(refreshResult.schemaOperations).toEqual([
      {
        type: 'refreshMaterializedView',
        viewName: 'users_snapshot',
        concurrently: true,
      },
    ]);
  });

  it.each([
    {
      kind: 'view',
      create: (builder: CollectionBuilder) =>
        builder.createViewCollection('usersView', (view) => {
          view.string('firstName');
          view.as((query) => query.from('users').select('firstName'));
        }),
    },
    {
      kind: 'materializedView',
      create: (builder: CollectionBuilder) =>
        builder.createMaterializedViewCollection('usersView', (view) => {
          view.string('firstName');
          view.as((query) => query.from('users').select('firstName'));
        }),
    },
  ])(
    'rejects renaming $kind collections before DDL',
    async ({ kind, create }) => {
      const schemaAdapter = new RecordingSchemaAdapter();
      const builder = new CollectionBuilder({ schemaAdapter });
      await create(builder);
      schemaAdapter.executed = [];

      await expect(
        builder.renameCollection('usersView', 'activeUsers'),
      ).rejects.toMatchObject({
        name: 'CollectionRenameUnsupportedKindError',
        code: 'COLLECTION_RENAME_UNSUPPORTED_KIND',
        from: 'usersView',
        to: 'activeUsers',
        kind,
      });
      expect(schemaAdapter.executed).toEqual([]);
    },
  );
});
