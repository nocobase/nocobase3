import type { DatabaseConnection } from '@nocobase/db';

/**
 * A store is built when the plugin is created, because the library reads the
 * plugin's api before it runs `setup`; the connection only arrives with
 * `setup`. The store reads it through this handle instead of holding it.
 */
export class DatabaseConnectionHandle {
  private connection: DatabaseConnection | undefined;

  constructor(
    private readonly owner: string,
    connection?: DatabaseConnection,
  ) {
    this.connection = connection;
  }

  set(connection: DatabaseConnection | undefined): void {
    this.connection = connection;
  }

  readonly resolve = (): DatabaseConnection => {
    if (!this.connection) {
      throw new Error(`${this.owner} requires a database connection`);
    }
    return this.connection;
  };
}

/** How a database store reaches the connection it reads. */
export type DatabaseConnectionSource = () => DatabaseConnection;
