import { createRequire } from 'node:module';
import type { Knex } from 'knex';

const require = createRequire(import.meta.url);

interface NativeConnection {
  readonly inTransaction: boolean;
  exec(sql: string): unknown;
}
interface KnexTransaction {
  trxClient: {
    query(connection: NativeConnection, sql: string): Promise<unknown>;
  };
  _completed: boolean;
  _resolver(value: unknown): void;
  _rejecter(error: unknown): void;
  _logAndDispose(
    connection: NativeConnection,
    message: string,
    cause: unknown,
  ): void;
}

const Transaction_Sqlite =
  require('knex/lib/dialects/sqlite3/execution/sqlite-transaction.js') as new (
    client: Knex.Client,
    ...rest: unknown[]
  ) => KnexTransaction;

// Knex turns a failed COMMIT into a rejection and releases the connection
// without rolling back. Servers such as PostgreSQL end the transaction
// themselves when COMMIT fails, but SQLite keeps it open so that the COMMIT
// can be retried — after a deferred foreign key violation, or SQLITE_BUSY
// while another connection reads the file. Knex never retries, so the pooled
// connection would go on running every later query inside that transaction.
class SqliteTransaction extends Transaction_Sqlite {
  commit(connection: NativeConnection, value: unknown): Promise<unknown> {
    const query = this.trxClient.query(connection, 'COMMIT;').then(
      (response) => {
        this._resolver(value);
        return response;
      },
      (error: unknown) => {
        this.rollbackFailedCommit(connection);
        this._rejecter(error);
      },
    );
    this._completed = true;
    return query;
  }

  // Runs synchronously on the native connection, before the rejection lets
  // Knex release the connection to the next caller.
  private rollbackFailedCommit(connection: NativeConnection): void {
    if (!connection.inTransaction) return;
    try {
      connection.exec('ROLLBACK');
    } catch (error) {
      // Marks the connection for the pool to destroy instead of reusing it.
      this._logAndDispose(
        connection,
        'Failed to roll back after a failed COMMIT',
        error,
      );
    }
  }
}

export function rollbackFailedCommits(client: typeof Knex.Client): void {
  // Knex's own declaration of `transaction` describes the public transactor,
  // not the internal Transaction class a client returns from it.
  const prototype = client.prototype as unknown as {
    transaction(this: Knex.Client, ...args: unknown[]): KnexTransaction;
  };
  prototype.transaction = function (...args) {
    return new SqliteTransaction(this, ...args);
  };
}
