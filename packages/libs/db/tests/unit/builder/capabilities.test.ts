import { describe, expect, it } from 'vitest';
import { type DatabaseCapabilities } from '../../../src/schema/adapter.js';
import { CollectionBuilder } from '../../../src/collection/builder/builder.js';
import { UnsupportedCapabilityError } from '../../../src/schema/capabilities.js';

const sqliteCapabilities: DatabaseCapabilities = {
  schemas: false,
  views: true,
  replaceView: true,
  materializedViews: false,
  refreshMaterializedViews: false,
  foreignKeys: true,
  deferrableConstraints: false,
  partialIndexes: true,
  nativeTypes: false,
  comments: false,
};

const mysqlLikeCapabilities: DatabaseCapabilities = {
  schemas: false,
  views: true,
  replaceView: true,
  materializedViews: false,
  refreshMaterializedViews: false,
  foreignKeys: true,
  deferrableConstraints: false,
  partialIndexes: false,
  nativeTypes: true,
  comments: true,
};

describe('CollectionBuilder capability planning', () => {
  it('warns and downgrades safe unsupported capabilities', async () => {
    const builder = new CollectionBuilder({
      schemaAdapter: {
        dialect: 'sqlite',
        capabilities: sqliteCapabilities,
        async execute() {},
        async compile() {
          return [];
        },
      },
    });

    const result = await builder.createCollection(
      'events',
      (collection) => {
        collection.dbSchema('public');
        collection.native('ipAddress', 'inet').dbComment('Client IP address');
        collection.string('email');
        collection.unique('email', { deferrable: 'deferred' });
      },
      { dryRun: true },
    );

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'UNSUPPORTED_SCHEMA',
          fallback: 'ignore',
          severity: 'warning',
        }),
        expect.objectContaining({
          code: 'UNSUPPORTED_NATIVE_TYPE',
          fallback: 'downgrade',
          severity: 'warning',
        }),
        expect.objectContaining({
          code: 'UNSUPPORTED_COMMENT',
          fallback: 'skip',
          severity: 'warning',
        }),
        expect.objectContaining({
          code: 'UNSUPPORTED_DEFERRABLE_CONSTRAINT',
          fallback: 'downgrade',
          severity: 'warning',
        }),
      ]),
    );
    expect(result.schemaOperations?.[0]).toMatchObject({
      type: 'createTable',
      table: {
        db: undefined,
        columns: [
          {
            name: 'ip_address',
            type: 'text',
            db: undefined,
          },
          {
            name: 'email',
            type: 'string',
          },
        ],
        constraints: [
          {
            type: 'unique',
            columns: ['email'],
          },
        ],
      },
    });
    const createTable = result.schemaOperations?.[0];
    expect(createTable?.type).toBe('createTable');
    if (createTable?.type === 'createTable') {
      expect(createTable.table.constraints[0]).not.toHaveProperty('deferrable');
    }
  });

  it('warns and skips unsafe materialized view operations in non-strict mode', async () => {
    const builder = new CollectionBuilder({
      schemaAdapter: {
        dialect: 'sqlite',
        capabilities: sqliteCapabilities,
        async execute() {},
      },
    });

    const result = await builder.createMaterializedViewCollection(
      'usersSnapshot',
      (view) => {
        view.string('email');
        view.as((query) => query.from('users').select('email'));
      },
    );

    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'UNSUPPORTED_MATERIALIZED_VIEW',
        fallback: 'skip',
        severity: 'unsafe',
      }),
    ]);
    expect(result.schemaOperations).toEqual([]);
  });

  it('only skips metadata for unsupported view operations in mixed apply batches', async () => {
    const builder = new CollectionBuilder({
      schemaAdapter: {
        dialect: 'sqlite',
        capabilities: sqliteCapabilities,
        async execute() {},
      },
    });

    const result = await builder.apply([
      {
        type: 'createViewCollection',
        name: 'usersView',
        definition: {
          fields: [{ name: 'email', type: 'string' }],
          view: {
            as: {
              from: 'users',
              select: ['email'],
            },
          },
        },
      },
      {
        type: 'createMaterializedViewCollection',
        name: 'usersSnapshot',
        definition: {
          fields: [{ name: 'email', type: 'string' }],
          view: {
            as: {
              from: 'users',
              select: ['email'],
            },
          },
        },
      },
    ]);

    expect(result.schemaOperations).toEqual([
      expect.objectContaining({
        type: 'createView',
        view: expect.objectContaining({
          name: 'users_view',
        }),
      }),
    ]);
  });

  it('throws unsupported capability errors in strict apply mode', async () => {
    const builder = new CollectionBuilder({
      schemaAdapter: {
        dialect: 'sqlite',
        capabilities: sqliteCapabilities,
        async execute() {},
      },
    });

    await expect(
      builder.createMaterializedViewCollection(
        'usersSnapshot',
        (view) => {
          view.string('email');
          view.as((query) => query.from('users').select('email'));
        },
        { strict: true },
      ),
    ).rejects.toBeInstanceOf(UnsupportedCapabilityError);
  });

  it('returns warnings instead of throwing during strict dryRun', async () => {
    const builder = new CollectionBuilder({
      schemaAdapter: {
        dialect: 'sqlite',
        capabilities: sqliteCapabilities,
        async execute() {},
      },
    });

    const result = await builder.createMaterializedViewCollection(
      'usersSnapshot',
      (view) => {
        view.string('email');
        view.as((query) => query.from('users').select('email'));
      },
      { dryRun: true, strict: true },
    );

    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'UNSUPPORTED_MATERIALIZED_VIEW',
        severity: 'unsafe',
      }),
    ]);
    expect(result.schemaOperations).toEqual([]);
  });

  it('marks partial unique constraints as unsafe and skips them', async () => {
    const builder = new CollectionBuilder({
      schemaAdapter: {
        dialect: 'mysql',
        capabilities: mysqlLikeCapabilities,
        async execute() {},
      },
    });

    const result = await builder.createCollection(
      'jobs',
      (collection) => {
        collection.integer('accountId');
        collection.integer('programId');
        collection.unique(['accountId', 'programId'], {
          predicate: {
            accountId: { $notNull: true },
          },
        });
      },
      { dryRun: true },
    );

    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'UNSUPPORTED_PARTIAL_UNIQUE_CONSTRAINT',
        fallback: 'skip',
        severity: 'unsafe',
      }),
    ]);
    expect(result.schemaOperations?.[0]).toMatchObject({
      type: 'createTable',
      table: {
        constraints: [],
      },
    });
  });

  it('skips unsupported refresh materialized view operations', async () => {
    const builder = new CollectionBuilder({
      schemaAdapter: {
        dialect: 'sqlite',
        capabilities: sqliteCapabilities,
        async execute() {},
      },
    });

    const result = await builder.refreshMaterializedViewCollection(
      'usersSnapshot',
      {
        dryRun: true,
        concurrently: true,
      },
    );

    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'UNSUPPORTED_REFRESH_MATERIALIZED_VIEW',
        fallback: 'skip',
        severity: 'unsafe',
      }),
    ]);
    expect(result.schemaOperations).toEqual([]);
  });

  it('downgrades unsupported replace view operations to create view', async () => {
    const builder = new CollectionBuilder({
      schemaAdapter: {
        dialect: 'legacy',
        capabilities: {
          ...sqliteCapabilities,
          nativeTypes: true,
          replaceView: false,
        },
        async execute() {},
      },
    });

    const result = await builder.replaceViewCollection(
      'usersView',
      (view) => {
        view.string('email');
        view.as((query) => query.from('users').select('email'));
      },
      { dryRun: true },
    );

    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'UNSUPPORTED_REPLACE_VIEW',
        fallback: 'downgrade',
        severity: 'warning',
      }),
    ]);
    expect(result.schemaOperations).toEqual([
      expect.objectContaining({
        type: 'createView',
        orReplace: false,
      }),
    ]);
  });

  it('skips unsupported views and does not sync their metadata', async () => {
    const builder = new CollectionBuilder({
      schemaAdapter: {
        dialect: 'minimal',
        capabilities: {
          ...sqliteCapabilities,
          views: false,
        },
        async execute() {},
      },
    });

    const result = await builder.createViewCollection('usersView', (view) => {
      view.string('email');
      view.as((query) => query.from('users').select('email'));
    });

    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'UNSUPPORTED_VIEW',
        fallback: 'skip',
        severity: 'unsafe',
      }),
    ]);
    expect(result.schemaOperations).toEqual([]);
  });

  it('warns and skips unsupported foreign keys and check constraints in alter operations', async () => {
    const builder = new CollectionBuilder({
      schemaAdapter: {
        dialect: 'minimal',
        capabilities: {
          ...sqliteCapabilities,
          foreignKeys: false,
        },
        async execute() {},
      },
    });

    const result = await builder.alterCollection(
      'orders',
      {
        addConstraints: [
          {
            type: 'foreignKey',
            fields: ['customerId'],
            references: {
              collection: 'customers',
              fields: ['id'],
            },
          },
          {
            type: 'check',
            expression: {
              amount: { $gte: 0 },
            },
          },
        ],
      },
      { dryRun: true },
    );

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'UNSUPPORTED_FOREIGN_KEY',
          fallback: 'skip',
          severity: 'unsafe',
        }),
        expect.objectContaining({
          code: 'UNSUPPORTED_CHECK_CONSTRAINT',
          fallback: 'skip',
          severity: 'unsafe',
        }),
      ]),
    );
    expect(result.schemaOperations).toEqual([]);
  });

  it('downgrades unsupported partial regular indexes without dropping the index', async () => {
    const builder = new CollectionBuilder({
      schemaAdapter: {
        dialect: 'mysql',
        capabilities: mysqlLikeCapabilities,
        async execute() {},
      },
    });

    const result = await builder.addIndex(
      'jobs',
      {
        fields: ['accountId'],
        name: 'idx_jobs_account_id_partial',
        predicate: {
          accountId: { $notNull: true },
        },
      },
      { dryRun: true },
    );

    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'UNSUPPORTED_PARTIAL_INDEX',
        fallback: 'downgrade',
        severity: 'warning',
      }),
    ]);
    expect(result.schemaOperations?.[0]).toMatchObject({
      type: 'alterTable',
      operations: [
        {
          type: 'addIndex',
          index: {
            columns: ['account_id'],
            name: 'idx_jobs_account_id_partial',
          },
        },
      ],
    });
    const alterTable = result.schemaOperations?.[0];
    expect(alterTable?.type).toBe('alterTable');
    if (
      alterTable?.type === 'alterTable' &&
      alterTable.operations[0].type === 'addIndex'
    ) {
      expect(alterTable.operations[0].index).not.toHaveProperty('predicate');
    }
  });

  it('uses all warnings when strict errors have no unsafe warnings', async () => {
    const builder = new CollectionBuilder({
      schemaAdapter: {
        dialect: 'sqlite',
        capabilities: sqliteCapabilities,
        async execute() {},
      },
    });

    await expect(
      builder.createCollection(
        'events',
        (collection) => {
          collection.dbSchema('public');
          collection.string('email').dbComment('Email address');
        },
        { strict: true },
      ),
    ).rejects.toThrow(/database schemas|database comments/i);
  });
});
