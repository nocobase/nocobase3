import { randomUUID } from 'node:crypto';
import type { DatabaseConnection } from '../database/connection.js';
import {
  assertManagedWriteConnection,
  assertTransactionActive,
  getConnectionOwner,
  transactionAuthority,
} from '../database/transaction.js';
import type {
  ManagedWriteDescriptor,
  ManagedWriteInterceptor,
  ManagedWriteRegistry,
  ManagedWriteResult,
  ManagedWriteSummary,
} from './managed-write-types.js';

interface RegistryState {
  readonly interceptors: Set<ManagedWriteInterceptor>;
  readonly registry: ManagedWriteRegistry;
}
const registries = new WeakMap<object, RegistryState>();

/** Trusted server infrastructure only. All connections of a manager share this registry. */
export function getManagedWriteRegistry(
  connection: DatabaseConnection,
): ManagedWriteRegistry {
  return registryState(connection).registry;
}

function registryState(connection: DatabaseConnection): RegistryState {
  const { manager } = getConnectionOwner(connection);
  let state = registries.get(manager);
  if (!state) {
    const interceptors = new Set<ManagedWriteInterceptor>();
    state = {
      interceptors,
      registry: Object.freeze({
        register(interceptor: ManagedWriteInterceptor): () => void {
          // Each registration owns its lifetime, even for the same function.
          const entry: ManagedWriteInterceptor = (descriptor, execute) =>
            interceptor(descriptor, execute);
          interceptors.add(entry);
          return () => {
            interceptors.delete(entry);
          };
        },
      }),
    };
    registries.set(manager, state);
  }
  return state;
}

/** Adapter-private execution bridge. Query compile never calls this function. */
export async function executeManagedWrite<T extends ManagedWriteResult>(
  connection: DatabaseConnection,
  operation: ManagedWriteDescriptor['operation'],
  target: ManagedWriteDescriptor['target'],
  execute: (connection: DatabaseConnection) => Promise<T>,
  summarize: (result: ManagedWriteResult) => ManagedWriteSummary,
): Promise<T> {
  assertTransactionActive(connection);
  const entries = [...registryState(connection).interceptors];
  if (entries.length === 0) return execute(connection);
  const { managerId, connectionId } = getConnectionOwner(connection);
  const executionId = randomUUID();
  const touched = new Set<DatabaseConnection>([connection]);
  const poison = (): void => {
    for (const candidate of touched) {
      const handle = transactionAuthority.current(candidate);
      if (handle) transactionAuthority.markRollbackOnly(handle);
    }
  };
  const dispatch = async (
    index: number,
    current: DatabaseConnection,
  ): Promise<T> => {
    const interceptor = entries[index];
    if (!interceptor) return execute(current);
    const descriptor: ManagedWriteDescriptor = Object.freeze({
      executionId,
      operation,
      managerId,
      connectionId,
      connection: current,
      target: Object.freeze({ ...target }),
      transaction: transactionAuthority.current(current),
      summarize,
    });
    let called = false;
    let closed = false;
    let violation = false;
    let pending: Promise<T> | undefined;
    try {
      const result = await interceptor(descriptor, (selected) => {
        if (called || closed) {
          violation = true;
          poison();
          return Promise.reject(
            new Error(
              'Managed write execute callback is single-use and execution-scoped.',
            ),
          );
        }
        called = true;
        pending = (async () => {
          assertManagedWriteConnection(current, selected);
          touched.add(selected);
          return dispatch(index + 1, selected);
        })();
        // Observe failure immediately, including callbacks the interceptor forgot to await.
        void pending.catch(() => {
          poison();
        });
        return pending;
      });
      closed = true;
      if (!pending)
        throw new Error('Managed write interceptor did not execute the write.');
      const original = await pending;
      if (violation)
        throw new Error(
          'Managed write execute callback is single-use and execution-scoped.',
        );
      if (result !== original)
        throw new Error(
          'Managed write interceptor must preserve the query result.',
        );
      return original;
    } catch (error) {
      closed = true;
      poison();
      // Settle any started write before releasing the transaction to its owner.
      if (pending)
        await pending.catch(() => {
          poison();
        });
      throw error;
    }
  };
  return dispatch(0, connection);
}
