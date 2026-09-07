import { randomUUID } from 'node:crypto';
import type { DatabaseConnection } from './connection.js';

/** Only the issuing database authority can prove that this handle is active. */
export interface TransactionHandle {
  readonly managerId: string;
  readonly connectionId: string;
  readonly transactionId: string;
  readonly connection: DatabaseConnection;
}

export interface TransactionAuthority {
  current(connection: DatabaseConnection): TransactionHandle | undefined;
  validate(handle: TransactionHandle, connection: DatabaseConnection): void;
  markRollbackOnly(handle: TransactionHandle): void;
}

export interface ConnectionOwner {
  readonly manager: object;
  managerId: string;
  connectionId: string;
}

interface TransactionState {
  handle: TransactionHandle;
  parent?: TransactionState;
  status: 'active' | 'committed' | 'rolled-back';
  rollbackReason?: 'protected-write-failed';
  isCompleted: () => boolean;
}

const managers = new WeakMap<object, string>();
const owners = new WeakMap<DatabaseConnection, ConnectionOwner>();
const connections = new WeakMap<DatabaseConnection, TransactionState>();
const handles = new WeakMap<TransactionHandle, TransactionState>();

function invalidTransaction(): Error {
  return new Error('Invalid or inactive database transaction handle.');
}

function active(state: TransactionState): boolean {
  return (
    state.status === 'active' &&
    !state.isCompleted() &&
    (!state.parent || active(state.parent))
  );
}

function validated(handle: TransactionHandle): TransactionState {
  const state = handles.get(handle);
  if (!state || !active(state)) {
    throw invalidTransaction();
  }
  return state;
}

/** Reads explicit connections only; never changes query connection selection. */
export const transactionAuthority: TransactionAuthority = Object.freeze({
  current(connection: DatabaseConnection): TransactionHandle | undefined {
    const state = connections.get(connection);
    return state && active(state) ? state.handle : undefined;
  },
  validate(handle: TransactionHandle, connection: DatabaseConnection): void {
    const state = validated(handle);
    if (
      state.handle.connection !== connection ||
      connections.get(connection) !== state
    ) {
      throw invalidTransaction();
    }
  },
  markRollbackOnly(handle: TransactionHandle): void {
    let state: TransactionState | undefined = validated(handle);
    while (state) {
      state.rollbackReason = 'protected-write-failed';
      state = state.parent;
    }
  },
});

/** Internal owner registration, deliberately absent from the package exports. */
export function registerConnectionOwner(
  connection: DatabaseConnection,
  manager: object,
): void {
  let managerId = managers.get(manager);
  if (!managerId) {
    managerId = randomUUID();
    managers.set(manager, managerId);
  }
  owners.set(connection, { manager, managerId, connectionId: randomUUID() });
}

export function beginTransaction(
  parentConnection: DatabaseConnection,
  connection: DatabaseConnection,
  isCompleted: () => boolean,
): void {
  if (!owners.has(parentConnection)) {
    registerConnectionOwner(parentConnection, parentConnection);
  }
  const owner = owners.get(parentConnection)!;
  const parent = connections.get(parentConnection);
  if (parent && !active(parent)) {
    throw invalidTransaction();
  }
  const handle: TransactionHandle = Object.freeze({
    managerId: owner.managerId,
    connectionId: owner.connectionId,
    transactionId: randomUUID(),
    connection,
  });
  const state: TransactionState = {
    handle,
    parent,
    status: 'active',
    isCompleted,
  };
  owners.set(connection, owner);
  connections.set(connection, state);
  handles.set(handle, state);
}

export function assertTransactionCommittable(
  connection: DatabaseConnection,
): void {
  let state = connections.get(connection);
  while (state) {
    if (state.rollbackReason) {
      throw new Error('Database transaction is rollback-only.');
    }
    state = state.parent;
  }
}

export function finishTransaction(
  connection: DatabaseConnection,
  committed: boolean,
): void {
  const state = connections.get(connection);
  if (state) {
    state.status = committed ? 'committed' : 'rolled-back';
  }
}

export function assertTransactionActive(connection: DatabaseConnection): void {
  const state = connections.get(connection);
  if (state && !active(state)) {
    throw invalidTransaction();
  }
}

export function isTransactionConnection(
  connection: DatabaseConnection,
): boolean {
  return connections.has(connection);
}

/** Infrastructure identity lookup; not exported from the package entry. */
export function getConnectionOwner(
  connection: DatabaseConnection,
): ConnectionOwner {
  if (!owners.has(connection)) registerConnectionOwner(connection, connection);
  return owners.get(connection)!;
}

/** A managed write can enter a child transaction, but cannot leave its transaction. */
export function assertManagedWriteConnection(
  source: DatabaseConnection,
  target: DatabaseConnection,
): void {
  assertTransactionActive(source);
  assertTransactionActive(target);
  if (
    getConnectionOwner(source) !== getConnectionOwner(target) ||
    (isTransactionConnection(source) && source !== target)
  ) {
    throw new Error(
      'Managed write connection does not belong to this execution.',
    );
  }
}
