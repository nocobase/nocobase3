import type { RestrictionRule } from './model.js';

export interface RestrictionRuleStore {
  create(rule: RestrictionRule): Promise<RestrictionRule>;
  update(key: string, rule: RestrictionRule): Promise<RestrictionRule>;
  delete(key: string): Promise<void>;
  get(key: string): Promise<RestrictionRule | undefined>;
  list(): Promise<readonly RestrictionRule[]>;
}
