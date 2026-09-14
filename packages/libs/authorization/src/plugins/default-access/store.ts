import type { DefaultAccessRule } from './model.js';

export interface DefaultAccessStore<TTransaction = unknown> {
  list(): Promise<readonly DefaultAccessRule[]>;
  get(
    resourceType: string,
    resourceId: string,
  ): Promise<DefaultAccessRule | undefined>;
  set(rule: DefaultAccessRule): Promise<DefaultAccessRule>;
  delete(resourceType: string, resourceId: string): Promise<void>;
  /**
   * Returns a store bound to the caller's transaction. The caller opens and
   * commits the transaction; a store without transactions returns itself.
   */
  withTransaction(transaction: TTransaction): DefaultAccessStore<TTransaction>;
}
