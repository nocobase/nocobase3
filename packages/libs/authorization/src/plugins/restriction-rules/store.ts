import type { RuleStore } from '../internal/rules.js';
import type { RestrictionRule } from './model.js';

export interface RestrictionRuleStore<TTransaction = unknown> extends RuleStore<
  RestrictionRule,
  TTransaction
> {
  /** A store bound to the caller's transaction; without transactions, itself. */
  withTransaction(
    transaction: TTransaction,
  ): RestrictionRuleStore<TTransaction>;
}
