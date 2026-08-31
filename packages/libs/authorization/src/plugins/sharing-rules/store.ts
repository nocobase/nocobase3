import type { SharingRule } from './model.js';

export interface SharingRuleStore {
  create(rule: SharingRule): Promise<SharingRule>;
  update(key: string, rule: SharingRule): Promise<SharingRule>;
  delete(key: string): Promise<void>;
  get(key: string): Promise<SharingRule | undefined>;
  list(): Promise<readonly SharingRule[]>;
}
