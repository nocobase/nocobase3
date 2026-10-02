import type { AnyConnectionConfig } from './config.js';

/** Environment variables a provisioner reads its server address and credentials from. */
export type TestDatabaseEnvironment = Readonly<
  Record<string, string | undefined>
>;

export interface TestDatabaseProvisionOptions {
  /**
   * Identifier of the isolated database or schema to create: lower-case
   * letters, digits and underscores, short enough for every dialect.
   */
  readonly name: string;
  readonly env: TestDatabaseEnvironment;
}

export interface ProvisionedTestDatabase {
  /** Connection configuration for the isolated database, as a dialect factory returns it. */
  readonly connection: AnyConnectionConfig;
  /** Removes the isolated database or schema and releases the administrative connection. */
  drop(): Promise<void>;
}

/**
 * Creates isolated databases for tests that must not depend on one dialect.
 *
 * Each dialect package exports one from its `./testing` entry, and
 * `@nocobase/db-testing` selects it by dialect name. Everything specific to
 * the database — the server address, credentials, and the statements that
 * create and drop the isolated database — stays in the dialect package.
 */
export interface TestDatabaseProvisioner {
  readonly dialect: string;
  provision(
    options: TestDatabaseProvisionOptions,
  ): Promise<ProvisionedTestDatabase>;
}
