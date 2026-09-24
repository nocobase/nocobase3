/** An in-memory store for any of the three rule plugins. */
export class MemoryRuleStore<TRule extends { key: string }> {
  constructor(private rules: readonly TRule[] = []) {}
  create(rule: TRule): Promise<TRule> {
    this.rules = [...this.rules, rule];
    return Promise.resolve(rule);
  }
  update(key: string, rule: TRule): Promise<TRule> {
    this.rules = this.rules.map((entry) => (entry.key === key ? rule : entry));
    return Promise.resolve(rule);
  }
  delete(key: string): Promise<void> {
    this.rules = this.rules.filter((entry) => entry.key !== key);
    return Promise.resolve();
  }
  get(key: string): Promise<TRule | undefined> {
    return Promise.resolve(this.rules.find((rule) => rule.key === key));
  }
  list(): Promise<readonly TRule[]> {
    return Promise.resolve(this.rules);
  }
  /** In-memory stores have no transactions. */
  withTransaction(): this {
    return this;
  }
}
