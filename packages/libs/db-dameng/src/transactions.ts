import { createRequire } from 'node:module';
import type { Knex } from 'knex';

const require = createRequire(import.meta.url);

interface InternalTransaction {
  acquireConnection(
    config: { connection?: unknown },
    callback: (connection: unknown) => Promise<unknown>,
  ): Promise<unknown>;
}

const BaseTransaction = require('knex/lib/execution/transaction.js') as {
  prototype: InternalTransaction;
};

/** Preserve the outer Dameng transaction when Knex finishes a savepoint. */
export function preserveNestedTransaction(
  transaction: Knex.Transaction,
): Knex.Transaction {
  // knex-dm's acquireConnection finalizer commits and clears isTransaction
  // even for a savepoint. The base finalizer only releases owned connections;
  // a nested transaction uses its parent's transaction client and connection.
  const internal = transaction as unknown as InternalTransaction;
  internal.acquireConnection =
    BaseTransaction.prototype.acquireConnection.bind(internal);
  return transaction;
}
