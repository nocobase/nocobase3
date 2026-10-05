import { randomUUID } from 'node:crypto';
import type { LifecycleRecord, LifecycleStore } from '@nocobase/lifecycle';

/** Children use deterministic string IDs; independent requests get UUIDs. */
export function createApprovalLabStore(store: LifecycleStore): LifecycleStore {
  return new Proxy(store, {
    get(target, property) {
      if (property === 'transaction')
        return <T>(
          work: (transaction: LifecycleStore) => Promise<T>,
        ): Promise<T> =>
          target.transaction((transaction) =>
            work(createApprovalLabStore(transaction)),
          );
      if (property === 'createRecord')
        return (
          collection: string,
          values: Readonly<Record<string, unknown>>,
        ): Promise<LifecycleRecord> =>
          target.createRecord(collection, {
            ...values,
            ...(collection.startsWith('scenario') && values.id === undefined
              ? { id: randomUUID() }
              : {}),
          });
      const value: unknown = Reflect.get(target, property);
      const bound: unknown =
        typeof value === 'function' ? value.bind(target) : value;
      return bound;
    },
  });
}
