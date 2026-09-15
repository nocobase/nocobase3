import { describe, expect, expectTypeOf, it } from 'vitest';

import sqlite from '@nocobase/db-sqlite';
import type {
  BaseConnectionConfig,
  ConnectionConfig,
  ConnectionsOfDrivers,
} from '@nocobase/db';

import {
  defineDatabaseConfig,
  type AppDatabaseConfig,
  type AppDatabaseConnectionConfig,
} from '../src/database/index.js';

/**
 * A dialect contributed by a package `@nocobase/db` knows nothing about, which is what
 * `@nocobase/db-kingbase`, `@nocobase/db-oceanbase` and `@nocobase/db-dameng` each are. Declared here rather than
 * imported so the contract is tested without this package depending on a dialect.
 *
 * Built the way those packages build theirs — a full connection config, an `Options` type that removes what the
 * registration supplies, and the dialect put back by the application — so this covers the shape an application
 * actually writes rather than a convenient approximation of it.
 */
interface ContributedConnectionConfig extends BaseConnectionConfig {
  dialect: 'cockroach';
  driver?: string;
  host?: string;
  port?: number;
}

type ContributedOptions = Omit<
  ContributedConnectionConfig,
  'dialect' | 'driver' | 'databaseDriver'
>;

type ContributedConnection = ContributedOptions & { dialect: 'cockroach' };

describe('AppDatabaseConfig', () => {
  /** Every existing application writes the bare form, so the default parameter has to keep meaning what it meant. */
  it('defaults to the dialects @nocobase/db declares', () => {
    const config: AppDatabaseConfig = {
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: 'app.sqlite',
          migrations: { autoRun: true },
        },
      },
    };

    expect(config.connections.main.dialect).toBe('sqlite');
    expectTypeOf<AppDatabaseConfig>().toMatchTypeOf<
      AppDatabaseConfig<ConnectionConfig>
    >();
  });

  /**
   * The runtime resolves a driver by name, so a contributed dialect has always worked once registered. Before this
   * parameter existed the type could not say so, and configuring one needed an assertion.
   */
  it('accepts a connection shape contributed by a dialect package', () => {
    const config: AppDatabaseConfig<ConnectionConfig | ContributedConnection> =
      {
        default: 'main',
        connections: {
          main: { dialect: 'cockroach', host: 'db.example.test', port: 26257 },
          cache: { dialect: 'sqlite', filename: 'cache.sqlite' },
        },
      };

    expect(config.connections.main.dialect).toBe('cockroach');
    expect(config.connections.cache.dialect).toBe('sqlite');
  });

  /** Application task settings reach a contributed connection the same way they reach a built-in one. */
  it('carries migration and seed settings onto a contributed connection', () => {
    const connection: AppDatabaseConnectionConfig<ContributedConnection> = {
      dialect: 'cockroach',
      host: 'db.example.test',
      seeds: { autoRun: false },
    };

    expect(connection.seeds?.autoRun).toBe(false);
  });

  /**
   * Widening is per configuration and per dialect. Naming a contributed shape must not turn the others into
   * `BaseConnectionConfig & { dialect: string }`, which would accept any field on any dialect.
   */
  it('keeps every other dialect as strict as it was', () => {
    expectTypeOf<{
      dialect: 'cockroach';
      host: string;
    }>().not.toMatchTypeOf<AppDatabaseConnectionConfig>();

    expectTypeOf<{ dialect: 'sqlite' }>().not.toMatchTypeOf<
      AppDatabaseConnectionConfig<ConnectionConfig | ContributedConnection>
    >();

    expectTypeOf<{
      dialect: 'postgres';
      serviceName: string;
    }>().not.toMatchTypeOf<
      AppDatabaseConnectionConfig<ConnectionConfig | ContributedConnection>
    >();
  });
});

describe('defineDatabaseConfig', () => {
  /**
   * A driver is looked up by the connection's own dialect, so a connection naming one the
   * application never registered fails the start with `Database dialect "..." is not registered.`.
   * These are the same rule, reported while typing.
   */
  it('accepts a connection whose dialect is registered', () => {
    const database = defineDatabaseConfig({ sqlite })(() => ({
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: 'app.sqlite' } },
    }));

    expect(database(runtime()).connections.main.dialect).toBe('sqlite');
  });

  it('carries the drivers through to the resolved configuration', () => {
    const database = defineDatabaseConfig({ sqlite })(() => ({
      connections: { main: { dialect: 'sqlite', filename: 'app.sqlite' } },
    }));

    expect(database(runtime()).drivers).toEqual({ sqlite });
  });

  it('applies application task settings to a connection', () => {
    const database = defineDatabaseConfig({ sqlite })(() => ({
      connections: {
        main: {
          dialect: 'sqlite',
          filename: 'app.sqlite',
          migrations: { autoRun: false },
        },
      },
    }));

    expect(database(runtime()).connections.main.migrations?.autoRun).toBe(
      false,
    );
  });

  /**
   * The rejections are compile-time, so they are asserted as types. Each body is what a `// @ts-expect-error`
   * would guard, written as an assignability check so a regression fails the typecheck rather than silently
   * passing.
   */
  it('rejects a dialect no registered driver declares', () => {
    type Registered = ConnectionsOfDrivers<{ sqlite: typeof sqlite }>;

    expectTypeOf<{ dialect: 'postgres' }>().not.toMatchTypeOf<Registered>();
    expectTypeOf<Registered>().toMatchTypeOf<{ dialect: 'sqlite' }>();
  });
});

function runtime(): never {
  return {
    configPaths: { storage: (file: string) => file },
  } as never;
}
