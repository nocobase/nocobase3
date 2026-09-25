import type { RuleStore } from '../internal/rules.js';
import type { SharingRule } from './model.js';

export interface SharingRuleStore<TTransaction = unknown> extends RuleStore<
  SharingRule,
  TTransaction
> {
  /** A store bound to the caller's transaction; without transactions, itself. */
  withTransaction(transaction: TTransaction): SharingRuleStore<TTransaction>;
}
