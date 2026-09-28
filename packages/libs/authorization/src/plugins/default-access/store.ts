import type { RuleStore } from '../internal/rules.js';
import type { DefaultAccessRule } from './model.js';

export interface DefaultAccessStore<TTransaction = unknown> extends RuleStore<
  DefaultAccessRule,
  TTransaction
> {
  /** A store bound to the caller's transaction; without transactions, itself. */
  withTransaction(transaction: TTransaction): DefaultAccessStore<TTransaction>;
}
