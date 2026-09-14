import type { RestrictionRule } from './model.js';

export interface RestrictionRuleStore<TTransaction = unknown> {
  create(rule: RestrictionRule): Promise<RestrictionRule>;
  update(key: string, rule: RestrictionRule): Promise<RestrictionRule>;
  delete(key: string): Promise<void>;
  get(key: string): Promise<RestrictionRule | undefined>;
  list(): Promise<readonly RestrictionRule[]>;
  /**
   * Returns a store bound to the caller's transaction. The caller opens and
   * commits the transaction; a store without transactions returns itself.
   */
  withTransaction(
    transaction: TTransaction,
  ): RestrictionRuleStore<TTransaction>;
}
