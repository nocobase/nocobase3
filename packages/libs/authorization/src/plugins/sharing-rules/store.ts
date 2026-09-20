import type { SharingRule } from './model.js';

export interface SharingRuleStore<TTransaction = unknown> {
  create(rule: SharingRule): Promise<SharingRule>;
  update(key: string, rule: SharingRule): Promise<SharingRule>;
  delete(key: string): Promise<void>;
  get(key: string): Promise<SharingRule | undefined>;
  list(): Promise<readonly SharingRule[]>;
  /**
   * Returns a store bound to the caller's transaction. The caller opens and
   * commits the transaction; a store without transactions returns itself.
   */
  withTransaction(transaction: TTransaction): SharingRuleStore<TTransaction>;
}
