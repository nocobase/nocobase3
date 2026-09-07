import { expect, it } from 'vitest';
import { SchemaInspectorError } from '../../../src/schema/inspector/errors.js';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('schema inspector', (context) => {
  it('reads a complete physical table model', async () => {
    const uniqueName = context.identifier('orders_tenant_number_unique');
    const statusIndex = context.identifier('orders_status_index');

    await context.builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection.string('name').notNull();
    });
    await context.builder.createCollection('orders', (collection) => {
      collection.increments('id');
      collection.integer('tenantId').notNull();
      collection.string('orderNo', { length: 40 }).notNull();
      collection.string('status', { length: 32 }).defaultTo('pending');
      collection.unique(['tenantId', 'orderNo'], { name: uniqueName });
      collection.index(['status'], { name: statusIndex });
      collection
        .belongsTo('customer', 'customers')
        .targetKey('id')
        .foreignKey('customerId')
        .foreignKeyType('integer')
        .unsigned()
        .constraints(true)
        .onDelete('restrict')
        .onUpdate('cascade');
    });

    const inspector = context.database.connection().schemaInspector;
    const result = await inspector.getPhysicalCollection({
      tableName: context.table('orders'),
    });

    expect(result).toBeDefined();
    expect(result).toMatchObject({
      tableName: context.table('orders'),
      kind: 'table',
      primaryKey: { columns: ['id'] },
    });
    expect(result?.columns.map((column) => column.columnName)).toEqual([
      'id',
      'tenant_id',
      'order_no',
      'status',
      'customer_id',
    ]);
    expect(
      result?.columns.find((column) => column.columnName === 'id'),
    ).toMatchObject({
      nullable: false,
      autoIncrement: true,
    });
    expect(
      result?.columns.find((column) => column.columnName === 'order_no'),
    ).toMatchObject({
      dataType: 'string',
      nullable: false,
      length: 40,
    });
    if (context.spec.dialect !== 'sqlite' && context.spec.dialect !== 'mssql') {
      expect(result?.uniqueConstraints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            columns: ['tenant_id', 'order_no'],
          }),
        ]),
      );
    }
    expect(result?.indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining([uniqueName, statusIndex]),
    );
    expect(
      result?.indexes.find((index) => index.name === uniqueName),
    ).toMatchObject({
      keys: [{ columnName: 'tenant_id' }, { columnName: 'order_no' }],
      unique: true,
    });
    expect(result?.foreignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columns: ['customer_id'],
          referencedCollection: expect.objectContaining({
            tableName: context.table('customers'),
          }),
          referencedColumns: ['id'],
          onDelete:
            context.spec.dialect === 'oracle' ||
            context.spec.dialect === 'mssql'
              ? 'noAction'
              : 'restrict',
          onUpdate: context.spec.dialect === 'oracle' ? 'noAction' : 'cascade',
        }),
      ]),
    );
    expect(result?.inspection.aspects.columns).toBe('complete');
    expect(result?.inspection.aspects.foreignKeys).toBe('complete');
    expect(result?.inspection.aspects.comments).toBe(
      context.spec.dialect === 'sqlite' ? 'unsupported' : 'complete',
    );
  });

  it('lists summaries with opaque cursor pagination and scans complete models', async () => {
    for (const name of ['alpha', 'beta', 'gamma']) {
      await context.builder.createCollection(name, (collection) => {
        collection.increments('id');
      });
    }

    const inspector = context.database.connection().schemaInspector;
    const schemas = await inspector.listSchemas();
    expect(schemas.some((schema) => schema.default)).toBe(true);

    const filter = {
      tableNamePrefixes: [`${context.prefix}_`],
      kinds: ['table'] as const,
      limit: 2,
    };
    const first = await inspector.listPhysicalCollections(filter);
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(first.items.map((item) => item.tableName)).toEqual(
      [...first.items.map((item) => item.tableName)].sort(),
    );

    const second = await inspector.listPhysicalCollections({
      ...filter,
      cursor: first.nextCursor,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeUndefined();

    await expect(
      inspector.listPhysicalCollections({
        ...filter,
        kinds: ['view'],
        cursor: first.nextCursor,
      }),
    ).rejects.toMatchObject({
      code: 'SCHEMA_INSPECTION_INVALID_CURSOR',
    });

    const scanned = [];
    for await (const collection of inspector.scanPhysicalCollections({
      tableNamePrefixes: [`${context.prefix}_`],
      kinds: ['table'],
      pageSize: 1,
    })) {
      scanned.push(collection.tableName);
    }
    expect(scanned).toEqual([
      context.table('alpha'),
      context.table('beta'),
      context.table('gamma'),
    ]);
  });

  it('reads views and distinguishes missing objects from invalid options', async () => {
    await context.builder.createCollection('sourceRows', (collection) => {
      collection.increments('id');
      collection.string('title');
    });
    await context.builder.createViewCollection('sourceRowsView', (view) => {
      view.integer('id');
      view.string('title');
      view.as((query) => query.from('sourceRows').select('id', 'title'));
    });

    const inspector = context.database.connection().schemaInspector;
    const view = await inspector.getPhysicalCollection({
      tableName: context.table('sourceRowsView'),
    });
    expect(view).toMatchObject({
      tableName: context.table('sourceRowsView'),
      kind: 'view',
    });
    expect(view?.viewDefinition).toEqual(expect.any(String));

    await expect(
      inspector.getPhysicalCollection({
        tableName: context.table('missing'),
      }),
    ).resolves.toBeUndefined();
    await expect(
      inspector.listPhysicalCollections({ limit: 1001 }),
    ).rejects.toBeInstanceOf(SchemaInspectorError);
  });

  it('uses the transaction connection client', async () => {
    await context.builder.createCollection('transactionRows', (collection) => {
      collection.increments('id');
      collection.string('title');
    });

    await context.database.connection().transaction(async (connection) => {
      const result = await connection.schemaInspector.getPhysicalCollection({
        tableName: context.table('transactionRows'),
      });

      expect(result).toMatchObject({
        tableName: context.table('transactionRows'),
        kind: 'table',
      });
    });
  });

  it.skipIf(context.spec.dialect !== 'oracle')(
    'preserves Oracle view SQL aliases and reports truncated catalog definitions',
    async () => {
      const inspector = context.database.connection().schemaInspector;
      const tableName = context.table('aliasedView');
      const definition = `select 'literal AS intact' as "value" from dual`;
      await context.db.raw(`create view ?? as ${definition}`, [tableName]);
      const view = await inspector.getPhysicalCollection({ tableName });
      expect(view?.viewDefinition).toBe(definition);
      expect(view?.inspection.aspects.viewDefinition).toBe('complete');

      const longName = context.table('longView');
      const longDefinition = `select 1 as "value" /* ${'x'.repeat(4200)} */ from dual`;
      await context.db.raw(`create view ?? as ${longDefinition}`, [longName]);
      const longView = await inspector.getPhysicalCollection({
        tableName: longName,
      });
      expect(longView?.viewDefinition).toBe(longDefinition.slice(0, 4000));
      expect(longView?.inspection.aspects.viewDefinition).toBe('partial');
      expect(longView?.inspection.warnings).toContainEqual({
        code: 'ORACLE_VIEW_DEFINITION_TRUNCATED',
        message:
          'Oracle view definition exceeded 4000 characters and was truncated.',
        aspect: 'viewDefinition',
      });
    },
  );

  it('preserves advanced dialect-specific physical schema details', async () => {
    const tableName = context.table('advancedSchema');
    const indexName = context.identifier('advanced_expression_index');

    switch (context.spec.dialect) {
      case 'sqlite':
        await context.db.raw(`
          create table "${tableName}" (
            "tenant_id" integer not null,
            "order_no" text not null,
            "email" text,
            "status" text,
            primary key ("tenant_id", "order_no"),
            check (length("status") > 0)
          )
        `);
        await context.db.raw(`
          create index "${indexName}"
          on "${tableName}" ("tenant_id", lower("email"))
          where "status" is not null
        `);
        break;
      case 'postgres':
        await context.db.raw(`
          create table "${tableName}" (
            "id" bigint generated always as identity primary key,
            "email" text,
            "status" text,
            "network" inet,
            "amount" numeric(12, 2),
            "normalized_email" text generated always as (lower("email")) stored,
            check ("status" <> '')
          )
        `);
        await context.db.raw(`
          create index "${indexName}"
          on "${tableName}" (lower("email") desc)
          include ("status")
          where "status" is not null
        `);
        await context.db.raw(
          `comment on table "${tableName}" is 'Advanced schema rows'`,
        );
        await context.db.raw(
          `comment on column "${tableName}"."email" is 'Original email'`,
        );
        break;
      case 'mysql':
        await context.db.raw(`
          create table \`${tableName}\` (
            \`id\` bigint unsigned not null auto_increment primary key,
            \`flag\` tinyint(1) not null,
            \`amount\` bigint unsigned,
            \`email\` varchar(255) comment 'Original email',
            \`normalized_email\` varchar(255)
              generated always as (lower(\`email\`)) stored,
            check (\`flag\` >= 0)
          ) comment = 'Advanced schema rows'
        `);
        break;
      case 'oracle':
        await context.db.raw(`
          create table "${tableName}" (
            "id" number generated always as identity primary key,
            "flag" number(1, 0) not null,
            "amount" number(18, 0),
            "email" varchar2(255),
            "created_at" date,
            "normalized_email" varchar2(255)
              generated always as (lower("email")) virtual,
            check ("flag" >= 0)
          )
        `);
        await context.db.raw(`
          create index "${indexName}"
          on "${tableName}" (lower("email"))
        `);
        await context.db.raw(
          `comment on table "${tableName}" is 'Advanced schema rows'`,
        );
        await context.db.raw(
          `comment on column "${tableName}"."email" is 'Original email'`,
        );
        break;
      case 'mssql':
        await context.db.raw(`
          create table [${tableName}] (
            [id] bigint identity(1,1) primary key,
            [flag] bit not null,
            [amount] decimal(12, 2),
            [email] nvarchar(255),
            [created_at] datetime2(3),
            [normalized_email] as lower([email]) persisted,
            check ([flag] in (0, 1))
          )
        `);
        await context.db.raw(`
          create index [${indexName}]
          on [${tableName}] ([email] desc)
          include ([created_at])
          where [email] is not null
        `);
        await context.db.raw(
          `exec sys.sp_addextendedproperty N'MS_Description', N'Advanced schema rows', N'Schema', N'dbo', N'Table', N'${tableName}'`,
        );
        await context.db.raw(
          `exec sys.sp_addextendedproperty N'MS_Description', N'Original email', N'Schema', N'dbo', N'Table', N'${tableName}', N'Column', N'email'`,
        );
        break;
    }

    const result = await context.database
      .connection()
      .schemaInspector.getPhysicalCollection({ tableName });

    expect(result).toBeDefined();
    if (context.spec.dialect === 'sqlite') {
      expect(result?.primaryKey?.columns).toEqual(['tenant_id', 'order_no']);
      expect(result?.checkConstraints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            expression: expect.stringContaining('length("status")'),
          }),
        ]),
      );
      expect(result?.inspection.aspects.checkConstraints).toBe('partial');
      expect(result?.inspection.aspects.comments).toBe('unsupported');
      expect(result?.indexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: indexName,
            keys: [
              expect.objectContaining({ columnName: 'tenant_id' }),
              expect.objectContaining({
                expression: expect.stringContaining('lower("email")'),
              }),
            ],
            predicate: expect.stringContaining('"status" is not null'),
          }),
        ]),
      );
    } else if (context.spec.dialect === 'postgres') {
      expect(result?.comment).toBe('Advanced schema rows');
      expect(
        result?.columns.find((column) => column.columnName === 'email')
          ?.comment,
      ).toBe('Original email');
      expect(
        result?.columns.find((column) => column.columnName === 'network'),
      ).toMatchObject({
        dataType: 'native',
        nativeType: 'inet',
        nativeTypeSchema: 'pg_catalog',
      });
      expect(
        result?.columns.find(
          (column) => column.columnName === 'normalized_email',
        ),
      ).toMatchObject({
        generated: {
          expression: expect.stringContaining('lower(email)'),
          stored: true,
        },
      });
      expect(result?.indexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: indexName,
            keys: [
              expect.objectContaining({
                expression: expect.stringContaining('lower(email)'),
                order: 'desc',
              }),
            ],
            includeColumns: ['status'],
            predicate: expect.stringContaining('status IS NOT NULL'),
          }),
        ]),
      );
    } else if (context.spec.dialect === 'mysql') {
      expect(result?.comment).toBe('Advanced schema rows');
      expect(
        result?.columns.find((column) => column.columnName === 'email')
          ?.comment,
      ).toBe('Original email');
      expect(
        result?.columns.find((column) => column.columnName === 'id'),
      ).toMatchObject({
        dataType: 'bigInt',
        autoIncrement: true,
        unsigned: true,
      });
      expect(
        result?.columns.find((column) => column.columnName === 'flag'),
      ).toMatchObject({ dataType: 'integer', nativeType: 'tinyint(1)' });
      expect(
        result?.columns.find(
          (column) => column.columnName === 'normalized_email',
        ),
      ).toMatchObject({
        generated: {
          expression: expect.any(String),
          stored: true,
        },
      });
      expect(result?.checkConstraints).not.toHaveLength(0);
      expect(result?.inspection.aspects.checkConstraints).toBe('complete');
    } else if (context.spec.dialect === 'oracle') {
      expect(result?.comment).toBe('Advanced schema rows');
      expect(
        result?.columns.find((column) => column.columnName === 'email')
          ?.comment,
      ).toBe('Original email');
      expect(
        result?.columns.find((column) => column.columnName === 'id'),
      ).toMatchObject({
        dataType: 'decimal',
        autoIncrement: true,
        nativeType: 'NUMBER',
      });
      expect(
        result?.columns.find((column) => column.columnName === 'flag'),
      ).toMatchObject({
        dataType: 'decimal',
        nativeType: 'NUMBER(1,0)',
      });
      expect(
        result?.columns.find((column) => column.columnName === 'created_at'),
      ).toMatchObject({ dataType: 'datetime', nativeType: 'DATE' });
      expect(
        result?.columns.find(
          (column) => column.columnName === 'normalized_email',
        ),
      ).toMatchObject({
        generated: {
          expression: expect.any(String),
          stored: false,
        },
      });
      expect(result?.indexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: indexName,
            keys: expect.arrayContaining([
              expect.objectContaining({ expression: expect.any(String) }),
            ]),
          }),
        ]),
      );
      expect(
        result?.indexes
          .find((index) => index.name === indexName)
          ?.keys[0]?.expression?.toLowerCase(),
      ).toContain('lower');
      expect(result?.checkConstraints).not.toHaveLength(0);
      expect(result?.inspection.aspects.comments).toBe('complete');
    } else {
      expect(result?.comment).toBe('Advanced schema rows');
      expect(
        result?.columns.find((column) => column.columnName === 'email')
          ?.comment,
      ).toBe('Original email');
      expect(
        result?.columns.find((column) => column.columnName === 'id'),
      ).toMatchObject({
        dataType: 'bigInt',
        autoIncrement: true,
        nativeType: 'bigint',
      });
      expect(
        result?.columns.find((column) => column.columnName === 'flag'),
      ).toMatchObject({ dataType: 'boolean', nativeType: 'bit' });
      expect(
        result?.columns.find(
          (column) => column.columnName === 'normalized_email',
        ),
      ).toMatchObject({
        generated: {
          expression: expect.stringContaining('lower'),
          stored: true,
        },
      });
      expect(result?.indexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: indexName,
            keys: [
              expect.objectContaining({ columnName: 'email', order: 'desc' }),
            ],
            includeColumns: ['created_at'],
            predicate: expect.stringContaining('email'),
          }),
        ]),
      );
      expect(result?.checkConstraints).not.toHaveLength(0);
      expect(result?.inspection.aspects.comments).toBe('complete');
    }
  });

  it('distinguishes PostgreSQL partitioned tables and materialized views', async () => {
    if (context.spec.dialect !== 'postgres') {
      return;
    }
    const partitionedTable = context.table('partitionedEvents');
    const materializedView = context.table('materializedEvents');
    await context.db.raw(`
      create table "${partitionedTable}" (
        "id" bigint not null,
        "created_at" timestamptz not null
      ) partition by range ("created_at")
    `);
    await context.db.raw(`
      create materialized view "${materializedView}"
      as select "id", "created_at" from "${partitionedTable}"
    `);

    try {
      await expect(
        context.database.connection().schemaInspector.getPhysicalCollection({
          tableName: partitionedTable,
        }),
      ).resolves.toMatchObject({ kind: 'partitionedTable' });
      await expect(
        context.database.connection().schemaInspector.getPhysicalCollection({
          tableName: materializedView,
        }),
      ).resolves.toMatchObject({
        kind: 'materializedView',
        viewDefinition: expect.any(String),
      });

      const page = await context.database
        .connection()
        .schemaInspector.listPhysicalCollections({
          kinds: ['materializedView'],
          tableNamePrefixes: [`${context.prefix}_`],
        });
      expect(page.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            tableName: materializedView,
            kind: 'materializedView',
          }),
        ]),
      );
    } finally {
      await context.db.raw(
        `drop materialized view if exists "${materializedView}"`,
      );
    }
  });

  it('distinguishes SQL Server unique constraints from filtered unique indexes', async () => {
    if (context.spec.dialect !== 'mssql') return;

    const constraintName = context.identifier('uq_accounts_tenant_code');
    const indexName = context.identifier('uq_accounts_active_email');
    await context.builder.createCollection('accounts', (collection) => {
      collection.increments('id');
      collection.integer('tenantId').notNull();
      collection.string('code').notNull();
      collection.string('email');
      collection.boolean('active').defaultTo(true);
      collection.unique(['tenantId', 'code'], {
        name: constraintName,
        mode: 'constraint',
      });
      collection.unique(['email'], {
        name: indexName,
        mode: 'index',
        predicate: { active: true },
      });
    });

    const result = await context.database
      .connection()
      .schemaInspector.getPhysicalCollection({
        tableName: context.table('accounts'),
      });

    expect(result?.uniqueConstraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: constraintName,
          columns: ['tenant_id', 'code'],
        }),
      ]),
    );
    expect(result?.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: constraintName,
          backsConstraint: { kind: 'unique', name: constraintName },
        }),
        expect.objectContaining({
          name: indexName,
          unique: true,
          predicate: expect.stringContaining('active'),
          backsConstraint: undefined,
        }),
      ]),
    );
  });
});
