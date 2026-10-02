---
'@nocobase/db': minor
'@nocobase/app-server': patch
---

`DatabaseConnection` gains `afterCommit(callback)` and `afterRollback(callback)`. A commit callback runs after the outermost transaction commits, in registration order, once the transaction's Collection metadata changes are applied, and `transaction()` resolves only after every commit callback has finished. Registered inside a nested `transaction()`, it waits for the outer commit and is dropped if that savepoint rolls back; outside a transaction it starts at once. Rollback callbacks receive the error after the transaction or savepoint rolls back, including when the commit itself fails. A callback that throws does not change the transaction's outcome: the error goes to the new connection option `onTransactionCallbackError(error, phase)`, or becomes a `TRANSACTION_CALLBACK_FAILED` process warning. Registering either on a transaction connection after its transaction has finished throws. Policy-bound connections forward both methods.

`@nocobase/app-server` ignores `onTransactionCallbackError` when deciding whether two connections point at the same database.
