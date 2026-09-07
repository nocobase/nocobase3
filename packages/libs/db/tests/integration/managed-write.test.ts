import type { Knex } from 'knex';
import { beforeEach, expect, it } from 'vitest';
import {
  createDatabaseManager,
  getManagedWriteRegistry,
  transactionAuthority,
  type ConnectionConfig,
  type DatabaseConnection,
  type ManagedWriteDescriptor,
  type ManagedWriteResult,
  type ManagedWriteSummary,
} from '../../src/index.js';
import { describeIntegrationDatabases } from './helpers.js';

describeIntegrationDatabases('Managed write execution', (context) => {
  let table: string;
  let markers: string;
  let source: DatabaseConnection;
  beforeEach(async () => {
    source = context.database.connection();
    table = context.table('business');
    markers = context.table('markers');
    await context.db.schema.createTable(table, (builder) => {
      builder.integer('id').primary();
      builder.integer('display_value').notNullable().defaultTo(0);
    });
    await context.db.schema.createTable(markers, (builder) => {
      builder.string('execution_id', 64).primary();
    });
  });

  const write = (id: number, connection = source) =>
    connection.query.insertInto(table).values({ id }).execute();
  const rows = (name = table) => context.db(name).select('*');
  const registry = () => getManagedWriteRegistry(source);
  const atomic = (
    mode: 'normal' | 'duplicate' | 'throw' = 'normal',
    seen: ManagedWriteDescriptor[] = [],
  ): (() => void) =>
    registry().register(async (descriptor, execute) => {
      if (
        descriptor.connectionId !== connectionId() ||
        descriptor.target.table !== table
      )
        return execute(descriptor.connection);
      seen.push(descriptor);
      const run = async (connection: DatabaseConnection) => {
        const handle = transactionAuthority.current(connection);
        expect(handle).toBeDefined();
        const result = await execute(connection);
        // Existing server-only native client is the infrastructure append path.
        const client = await connection.client<Knex>();
        await client(markers).insert({ execution_id: descriptor.executionId });
        if (mode === 'duplicate')
          await client(markers).insert({
            execution_id: descriptor.executionId,
          });
        if (mode === 'throw') throw new Error('Synthetic marker failure');
        return result;
      };
      return descriptor.transaction
        ? run(descriptor.connection)
        : descriptor.connection.transaction(run);
    });
  // The helper obtains identity from a descriptor without touching a business row.
  let observedConnectionId: string | undefined;
  beforeEach(() => {
    observedConnectionId = undefined;
  });
  const connectionId = (): string | undefined => observedConnectionId;
  beforeEach(() => {
    registry().register((descriptor, execute) => {
      if (
        descriptor.connection.name === source.name &&
        descriptor.connectionId &&
        !observedConnectionId
      )
        observedConnectionId = descriptor.connectionId;
      return execute(descriptor.connection);
    });
  });

  it('commits business and side marker in the same actual transaction with original result identity', async () => {
    let original: ManagedWriteResult | undefined;
    atomic();
    registry().register(async (descriptor, execute) => {
      expect(descriptor.transaction).toBeDefined();
      transactionAuthority.validate(
        descriptor.transaction!,
        descriptor.connection,
      );
      const executed = await execute(descriptor.connection);
      original = executed;
      return executed;
    });
    const result = await write(1);
    expect(result).toBe(original);
    expect(result.insertedCount).toBe(1);
    expect(await rows()).toHaveLength(1);
    expect(await rows(markers)).toHaveLength(1);
  });

  it('rolls back both tables on real duplicate marker failure and on business failure without retries', async () => {
    let calls = 0;
    registry().register((descriptor, execute) => {
      calls++;
      return execute(descriptor.connection);
    });
    const dispose = atomic('duplicate');
    await expect(write(1)).rejects.toThrow();
    expect(calls).toBe(1);
    expect(await rows()).toEqual([]);
    expect(await rows(markers)).toEqual([]);
    dispose();
    atomic();
    await context.db(table).insert({ id: 1 });
    await expect(write(1)).rejects.toThrow();
    expect(calls).toBe(2);
    expect(await rows()).toHaveLength(1);
    expect(await rows(markers)).toEqual([]);
  });

  it('poisons an outer transaction even if the caller catches marker failure and returns', async () => {
    atomic('throw');
    await expect(
      source.transaction(async (connection) => {
        await expect(write(1, connection)).rejects.toThrow(
          'Synthetic marker failure',
        );
        return 'caught';
      }),
    ).rejects.toThrow('rollback-only');
    expect(await rows()).toEqual([]);
    expect(await rows(markers)).toEqual([]);
  });

  it('rolls back ancestor transactions after caught nested failure and after a later outer throw', async () => {
    const dispose = atomic('throw');
    await expect(
      source.transaction(async (outer) => {
        await expect(
          outer.transaction(async (inner) => {
            await expect(write(1, inner)).rejects.toThrow(
              'Synthetic marker failure',
            );
          }),
        ).rejects.toThrow('rollback-only');
      }),
    ).rejects.toThrow('rollback-only');
    expect(await rows()).toEqual([]);
    expect(await rows(markers)).toEqual([]);
    dispose();
    atomic();
    await expect(
      source.transaction(async (outer) => {
        await write(2, outer);
        throw new Error('Synthetic later failure');
      }),
    ).rejects.toThrow('Synthetic later failure');
    expect(await rows()).toEqual([]);
    expect(await rows(markers)).toEqual([]);
  });

  it('observes cached builders and every mutation clone at execute time, and detaches on dispose', async () => {
    const insert = source.query.insertInto(table);
    const cached = insert.values({ id: 1 });
    const update = source.query
      .updateTable(table)
      .set({ displayValue: 5 })
      .where('id', '=', 1);
    const remove = source.query.deleteFrom(table).where('id', '=', 1);
    const seen: ManagedWriteDescriptor[] = [];
    const dispose = atomic('normal', seen);
    await cached.execute();
    await update.clearWhere().allowAllRows().set({ displayValue: 7 }).execute();
    await remove.clearWhere().allowAllRows().execute();
    expect(seen.map((item) => item.operation)).toEqual([
      'insert',
      'update',
      'delete',
    ]);
    expect(new Set(seen.map((item) => item.executionId)).size).toBe(3);
    dispose();
    dispose();
    await insert.values({ id: 2 }).execute();
    expect(seen).toHaveLength(3);
    expect(await rows(markers)).toHaveLength(3);
  });

  it('compile and reads have no extension side effects and unmatched writes do not select business rows', async () => {
    const seen: string[] = [];
    registry().register((descriptor, execute) => {
      seen.push(descriptor.target.table);
      return execute(descriptor.connection);
    });
    const sql = source.query.insertInto(table).values({ id: 1 }).compile();
    source.query
      .updateTable(table)
      .set({ displayValue: 1 })
      .where('id', '=', 1)
      .compile();
    source.query.deleteFrom(table).where('id', '=', 1).compile();
    expect(sql.sql).toContain(table);
    expect(seen).toEqual([]);
    expect(await rows()).toEqual([]);
    const queries: string[] = [];
    const listener = (query: { sql: string }) => {
      queries.push(query.sql);
    };
    context.db.on('query', listener);
    try {
      await write(1);
    } finally {
      context.db.removeListener('query', listener);
    }
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatch(/^insert/i);
    expect(seen).toEqual([table]);
    await source.query.selectFrom(table).selectAll().execute();
    expect(seen).toEqual([table]);
  });

  it('rejects repeated execute even when caught and prevents a second business write', async () => {
    atomic();
    registry().register(async (descriptor, execute) => {
      const result = await execute(descriptor.connection);
      await expect(execute(descriptor.connection)).rejects.toThrow(
        'single-use',
      );
      return result;
    });
    await expect(write(1)).rejects.toThrow('single-use');
    expect(await rows()).toEqual([]);
    expect(await rows(markers)).toEqual([]);
  });

  it('does not retry a failed execution when an extension catches it and tries again', async () => {
    await context.db(table).insert({ id: 1 });
    atomic();
    registry().register(async (descriptor, execute) => {
      await expect(execute(descriptor.connection)).rejects.toThrow();
      return execute(descriptor.connection);
    });
    await expect(write(1)).rejects.toThrow('single-use');
    expect(await rows()).toHaveLength(1);
    expect(await rows(markers)).toEqual([]);
  });

  it('settles concurrent callback attempts once and rolls back the successful first attempt', async () => {
    atomic();
    registry().register(async (descriptor, execute) => {
      const attempts = await Promise.allSettled([
        execute(descriptor.connection),
        execute(descriptor.connection),
      ]);
      const result = attempts[0];
      expect(attempts[1].status).toBe('rejected');
      if (result.status === 'rejected') throw result.reason;
      return result.value;
    });
    await expect(write(1)).rejects.toThrow('single-use');
    expect(await rows()).toEqual([]);
    expect(await rows(markers)).toEqual([]);
  });

  it('closes retained callbacks after exceptions and successful executions', async () => {
    let retained: (() => Promise<ManagedWriteResult>) | undefined;
    const dispose = registry().register((descriptor, execute) => {
      retained = () => execute(descriptor.connection);
      throw new Error('Synthetic extension failure');
    });
    await expect(write(1)).rejects.toThrow('Synthetic extension failure');
    await expect(retained!()).rejects.toThrow('single-use');
    expect(await rows()).toEqual([]);
    dispose();
    registry().register((descriptor, execute) => {
      retained = () => execute(descriptor.connection);
      return execute(descriptor.connection);
    });
    await write(2);
    await expect(retained!()).rejects.toThrow('single-use');
    expect(await rows()).toHaveLength(1);
  });

  it('rejects connection redirection and leaving an existing transaction', async () => {
    const foreign = createDatabaseManager({
      connections: { alien: { dialect: 'sqlite', filename: ':memory:' } },
    });
    const dispose = registry().register((_descriptor, execute) =>
      execute(foreign.connection()),
    );
    try {
      await expect(write(1)).rejects.toThrow('does not belong');
    } finally {
      dispose();
      await foreign.destroy();
    }
    registry().register((_descriptor, execute) => execute(source));
    await expect(
      source.transaction(async (connection) => {
        await expect(write(1, connection)).rejects.toThrow('does not belong');
      }),
    ).rejects.toThrow('rollback-only');
    expect(await rows()).toEqual([]);
  });

  it('keeps summaries execution-bound, contains no SQL values and distinguishes real zero from unknown', async () => {
    const summaries: ManagedWriteSummary[] = [];
    const descriptions: ManagedWriteDescriptor[] = [];
    registry().register(async (descriptor, execute) => {
      descriptions.push(descriptor);
      expect(descriptor.summarize({})).toEqual({ countSemantics: 'unknown' });
      const result = await execute(descriptor.connection);
      summaries.push(descriptor.summarize(result));
      expect(descriptor.summarize({ ...result })).toEqual({
        countSemantics: 'unknown',
      });
      expect(Object.keys(descriptor).sort()).toEqual([
        'connection',
        'connectionId',
        'executionId',
        'managerId',
        'operation',
        'summarize',
        'target',
        'transaction',
      ]);
      expect(Object.isFrozen(descriptor)).toBe(true);
      expect(Object.isFrozen(descriptor.target)).toBe(true);
      return result;
    });
    await source.query
      .insertInto(table)
      .values([{ id: 1 }, { id: 2 }])
      .execute();
    await source.query
      .updateTable(table)
      .set({ displayValue: 0 })
      .where('id', '=', 1)
      .execute();
    await source.query
      .updateTable(table)
      .set({ displayValue: 1 })
      .where('id', '=', 1)
      .execute();
    await source.query
      .updateTable(table)
      .set({ displayValue: 1 })
      .where('id', '=', 999)
      .execute();
    await source.query.deleteFrom(table).where('id', '=', 1).execute();
    await source.query.deleteFrom(table).where('id', '=', 999).execute();
    expect(summaries).toEqual([
      context.spec.dialect === 'postgres'
        ? { count: 2, countSemantics: 'inserted' }
        : { countSemantics: 'unknown' },
      { count: 1, countSemantics: 'matched' },
      { count: 1, countSemantics: 'matched' },
      { count: 0, countSemantics: 'matched' },
      { count: 1, countSemantics: 'deleted' },
      { count: 0, countSemantics: 'deleted' },
    ]);
    expect(
      new Set(descriptions.map((descriptor) => descriptor.connectionId)).size,
    ).toBe(1);
  });

  it('uses actual query naming and explicit metadata bindings rather than guessing collection mappings', async () => {
    const physical = context.table('physical_custom');
    const logical = context.table('logical');
    await context.builder.createCollection(logical, (collection) => {
      collection.tableName(physical);
      collection.integer('id').primary();
      collection.string('businessLabel', { columnName: 'stored_label' });
    });
    await context.db.schema.createTable(logical, (builder) => {
      builder.integer('id');
      builder.string('business_label');
    });
    const definition = await context.metadataStore.getCollection(logical);
    expect(definition?.tableName).toBe(physical);
    const targets: string[] = [];
    registry().register((descriptor, execute) => {
      targets.push(descriptor.target.table);
      return execute(descriptor.connection);
    });
    await source.query
      .insertInto(logical)
      .values({ id: 1, businessLabel: 'SYNTHETIC_LOGICAL' })
      .execute();
    await source.query
      .insertInto(physical)
      .values({ id: 2, stored_label: 'SYNTHETIC_PHYSICAL' })
      .execute();
    await source.query
      .updateTable(physical + ' as p')
      .set({ storedLabel: 'SYNTHETIC_UPDATED' })
      .where('p.id', '=', 2)
      .execute();
    expect(targets).toEqual([logical, physical, physical]);
    expect(await context.db(logical).first('business_label')).toEqual({
      business_label: 'SYNTHETIC_LOGICAL',
    });
    expect(await context.db(physical).first('stored_label')).toEqual({
      stored_label: 'SYNTHETIC_UPDATED',
    });
    const wrong = source.query
      .insertInto(logical)
      .values({ businessLabel: 'SYNTHETIC' })
      .compile();
    expect(wrong.sql).not.toContain(physical);
    expect(wrong.sql).toContain('business_label');
  });

  it('maps camelCase table identifiers through the same naming path without applying a prefix twice', async () => {
    const name = `${context.prefix}_camelTable`;
    const physical = context.table('camelTable');
    await context.db.schema.createTable(physical, (builder) => {
      builder.integer('id');
      builder.string('display_name');
    });
    const targets: string[] = [];
    registry().register((descriptor, execute) => {
      targets.push(descriptor.target.table);
      return execute(descriptor.connection);
    });
    const query = source.query
      .insertInto(name)
      .values({ id: 1, displayName: 'SYNTHETIC_VALUE' });
    expect(query.compile().sql).toContain(physical);
    await query.execute();
    expect(targets).toEqual([physical]);
    expect(await context.db(physical).select('display_name')).toEqual([
      { display_name: 'SYNTHETIC_VALUE' },
    ]);
  });

  it('describes explicitly qualified schema without conflating it with another schema', async () => {
    const schema =
      context.spec.dialect === 'sqlite'
        ? 'main'
        : context.spec.dialect === 'postgres'
          ? 'public'
          : context.spec.database!;
    const targets: ManagedWriteDescriptor['target'][] = [];
    registry().register((descriptor, execute) => {
      targets.push(descriptor.target);
      return execute(descriptor.connection);
    });
    await source.query
      .insertInto(`${schema}.${table}`)
      .values({ id: 1 })
      .execute();
    expect(targets).toEqual([{ table, schema }]);
    expect(await rows()).toHaveLength(1);
  });
  it('keeps identically named tables in distinct physical schemas separate', async () => {
    const schema = context.table('isolated_schema');
    if (context.spec.dialect === 'sqlite')
      await context.db.raw('attach database ? as ??', [':memory:', schema]);
    else if (context.spec.dialect === 'postgres')
      await context.db.raw('create schema ??', [schema]);
    else await context.db.raw('create database ??', [schema]);
    try {
      await context.db.schema
        .withSchema(schema)
        .createTable(table, (builder) => {
          builder.integer('id');
        });
      const seen: ManagedWriteDescriptor['target'][] = [];
      registry().register((descriptor, execute) => {
        seen.push(descriptor.target);
        return execute(descriptor.connection);
      });
      await source.query
        .insertInto(`${schema}.${table}`)
        .values({ id: 7 })
        .execute();
      await write(8);
      expect(seen).toEqual([{ table, schema }, { table }]);
      expect(await context.db(table).withSchema(schema).select('id')).toEqual([
        { id: 7 },
      ]);
      expect(await context.db(table).select('id')).toEqual([{ id: 8 }]);
    } finally {
      if (context.spec.dialect === 'sqlite')
        await context.db.raw('detach database ??', [schema]);
      else if (context.spec.dialect === 'postgres')
        await context.db.raw('drop schema ?? cascade', [schema]);
      else await context.db.raw('drop database ??', [schema]);
    }
  });

  it('shares the live registry with new connections and transaction children but keeps connection identities distinct', async () => {
    const config: ConnectionConfig =
      context.spec.dialect === 'sqlite'
        ? { dialect: 'sqlite', filename: ':memory:' }
        : {
            ...(context.spec.dialect === 'postgres'
              ? { dialect: 'postgres' as const }
              : { dialect: 'mysql' as const }),
            host: context.spec.host,
            port: context.spec.port,
            database: context.spec.database,
            username: context.spec.username,
            password: context.spec.password,
          };
    const otherDatabase = context.table('isolated_database');
    if (context.spec.dialect !== 'sqlite')
      await context.db.raw('create database ??', [otherDatabase]);
    const laterConfig: ConnectionConfig =
      config.dialect === 'sqlite'
        ? config
        : { ...config, database: otherDatabase };
    const manager = createDatabaseManager({
      connections: { primary: config, later: laterConfig },
    });
    const primary = manager.connection('primary');
    const cached = primary.query.insertInto(table).values({ id: 10 });
    const descriptors: ManagedWriteDescriptor[] = [];
    const dispose = getManagedWriteRegistry(primary).register(
      (descriptor, execute) => {
        descriptors.push(descriptor);
        return execute(descriptor.connection);
      },
    );
    try {
      const later = manager.connection('later');
      {
        for (const connection of context.spec.dialect === 'sqlite'
          ? [primary, later]
          : [later]) {
          await (
            await connection.client<Knex>()
          ).schema.createTable(table, (builder) => {
            builder.integer('id');
          });
        }
      }
      expect(getManagedWriteRegistry(later)).toBe(
        getManagedWriteRegistry(primary),
      );
      expect(getManagedWriteRegistry(source)).not.toBe(
        getManagedWriteRegistry(primary),
      );
      await cached.execute();
      await later.transaction(async (child) => {
        expect(getManagedWriteRegistry(child)).toBe(
          getManagedWriteRegistry(primary),
        );
        await child.query.insertInto(table).values({ id: 11 }).execute();
      });
      expect(descriptors).toHaveLength(2);
      expect(descriptors[0].managerId).toBe(descriptors[1].managerId);
      expect(descriptors[0].connectionId).not.toBe(descriptors[1].connectionId);
      const protectedId = descriptors[0].connectionId;
      let primaryHits = 0;
      getManagedWriteRegistry(primary).register((descriptor, execute) => {
        if (
          descriptor.connectionId === protectedId &&
          descriptor.target.table === table
        )
          primaryHits++;
        return execute(descriptor.connection);
      });
      await later.query.insertInto(table).values({ id: 12 }).execute();
      await primary.query.insertInto(table).values({ id: 13 }).execute();
      expect(primaryHits).toBe(1);
      dispose();
      await primary.query.insertInto(table).values({ id: 14 }).execute();
      expect(descriptors).toHaveLength(4);
    } finally {
      await manager.destroy();
      if (context.spec.dialect !== 'sqlite')
        await context.db.raw('drop database ??', [otherDatabase]);
    }
  });

  it('keeps cached builders connected to live policy across reconnect', async () => {
    const cached = source.query.insertInto(table).values({ id: 1 });
    const seen: ManagedWriteDescriptor[] = [];
    const dispose = registry().register((descriptor, execute) => {
      seen.push(descriptor);
      return execute(descriptor.connection);
    });
    await write(2);
    await context.database.reconnect();
    const client = await source.client<Knex>();
    context.db = client;
    if (context.spec.dialect === 'sqlite') {
      await client.schema.createTable(table, (builder) => {
        builder.integer('id');
      });
    }
    await cached.execute();
    expect(seen).toHaveLength(2);
    expect(seen[0].connectionId).toBe(seen[1].connectionId);
    expect(seen[0].executionId).not.toBe(seen[1].executionId);
    dispose();
    await write(3);
    expect(seen).toHaveLength(2);
  });

  it('freezes the interceptor chain per execution and supports independent duplicate registrations', async () => {
    const calls: string[] = [];
    let added = false;
    registry().register((descriptor, execute) => {
      if (!added) {
        added = true;
        registry().register((next, run) => {
          calls.push('later');
          return run(next.connection);
        });
      }
      return execute(descriptor.connection);
    });
    const interceptor: import('../../src/index.js').ManagedWriteInterceptor = (
      descriptor,
      execute,
    ) => {
      calls.push('duplicate');
      return execute(descriptor.connection);
    };
    const dispose = registry().register(interceptor);
    registry().register(interceptor);
    await write(1);
    expect(calls).toEqual(['duplicate', 'duplicate']);
    calls.length = 0;
    dispose();
    await write(2);
    expect(calls).toEqual(['duplicate', 'later']);
  });

  it('rejects an interceptor which swallows a write failure or returns without executing', async () => {
    atomic();
    const dispose = registry().register(async (descriptor, execute) => {
      const result = await execute(descriptor.connection);
      return { ...result };
    });
    await expect(write(1)).rejects.toThrow('preserve the query result');
    expect(await rows()).toEqual([]);
    dispose();
    // A trusted interceptor cannot manufacture a successful result without a write.
    registry().register(<T extends ManagedWriteResult>() =>
      Promise.resolve({} as T),
    );
    await expect(write(2)).rejects.toThrow('did not execute');
    expect(await rows()).toEqual([]);
  });

  if (context.spec.dialect === 'mysql') {
    for (const flags of ['-FOUND_ROWS', ['-FOUND_ROWS'], ['-found_rows']]) {
      it(`proves mysql2 affectedRows semantics for flags ${JSON.stringify(flags)}`, async () => {
        const manager = createDatabaseManager({
          connections: {
            changed: {
              dialect: 'mysql',
              host: context.spec.host,
              port: context.spec.port,
              database: context.spec.database,
              username: context.spec.username,
              password: context.spec.password,
              driverOptions: { flags },
            },
          },
        });
        const connection = manager.connection();
        const summaries: ManagedWriteSummary[] = [];
        getManagedWriteRegistry(connection).register(
          async (descriptor, execute) => {
            const result = await execute(descriptor.connection);
            summaries.push(descriptor.summarize(result));
            return result;
          },
        );
        try {
          await context.db(table).insert({ id: 1, display_value: 0 });
          await connection.query
            .updateTable(table)
            .set({ displayValue: 0 })
            .where('id', '=', 1)
            .execute();
          await connection.query
            .updateTable(table)
            .set({ displayValue: 2 })
            .where('id', '=', 1)
            .execute();
          await connection.query
            .updateTable(table)
            .set({ displayValue: 2 })
            .where('id', '=', 999)
            .execute();
          const changed =
            typeof flags === 'string' || flags[0] === '-FOUND_ROWS';
          expect(summaries).toEqual([
            {
              count: changed ? 0 : 1,
              countSemantics: changed ? 'changed' : 'matched',
            },
            { count: 1, countSemantics: changed ? 'changed' : 'matched' },
            { count: 0, countSemantics: changed ? 'changed' : 'matched' },
          ]);
        } finally {
          await manager.destroy();
        }
      });
    }
  }
});
