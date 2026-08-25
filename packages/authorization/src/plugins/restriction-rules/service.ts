import type {
  AccessConstraint,
  AccessConstraintResolver,
  AuthorizationSubject,
  ResolveAccessConstraintsInput,
} from '../../core/index.js';
import { resolveAuthorizationSubjects } from '../../core/index.js';
import type { RestrictionRule } from './model.js';
import type { RestrictionRuleStore } from './store.js';

export interface RestrictionRulesApi {
  create(rule: RestrictionRule): Promise<RestrictionRule>;
  update(key: string, rule: RestrictionRule): Promise<RestrictionRule>;
  delete(key: string): Promise<void>;
  get(key: string): Promise<RestrictionRule | undefined>;
  list(): Promise<readonly RestrictionRule[]>;
}

export class RestrictionRuleService
  implements RestrictionRulesApi, AccessConstraintResolver
{
  readonly id = 'restriction-rules';
  private store?: RestrictionRuleStore;

  constructor(store?: RestrictionRuleStore) {
    this.store = store;
  }
  initialize(store: RestrictionRuleStore): void {
    this.store = store;
  }
  create(rule: RestrictionRule): Promise<RestrictionRule> {
    return this.getStore().create(rule);
  }
  update(key: string, rule: RestrictionRule): Promise<RestrictionRule> {
    return this.getStore().update(key, rule);
  }
  delete(key: string): Promise<void> {
    return this.getStore().delete(key);
  }
  get(key: string): Promise<RestrictionRule | undefined> {
    return this.getStore().get(key);
  }
  list(): Promise<readonly RestrictionRule[]> {
    return this.getStore().list();
  }

  async resolve(
    input: ResolveAccessConstraintsInput,
  ): Promise<readonly AccessConstraint[]> {
    const subjects = resolveAuthorizationSubjects(input);
    const rules = await this.getStore().list();
    return rules
      .flatMap((rule) => {
        const configured = rule.actions.find(
          (action) => action.action === input.action,
        );
        return restrictionMatches(rule, input) &&
          appliesToSubject(rule.subjects, subjects) &&
          configured
          ? [{ rule, configured }]
          : [];
      })
      .map(({ rule, configured }) => ({
        source: { plugin: this.id, id: rule.key },
        effect: 'restrict' as const,
        value: configured.scope,
      }));
  }

  private getStore(): RestrictionRuleStore {
    if (!this.store)
      throw new Error('Restriction Rules has not been initialized');
    return this.store;
  }
}

function restrictionMatches(
  rule: RestrictionRule,
  input: ResolveAccessConstraintsInput,
): boolean {
  return (
    rule.resource.type === input.resource.type &&
    (rule.resource.id === '*' || rule.resource.id === input.resource.id) &&
    rule.actions.some((action) => action.action === input.action)
  );
}

function appliesToSubject(
  configured: readonly AuthorizationSubject[],
  actual: readonly AuthorizationSubject[],
): boolean {
  const keys = new Set(
    actual.map((subject) => `${subject.type}\u0000${subject.id}`),
  );
  return configured.some((subject) =>
    keys.has(`${subject.type}\u0000${subject.id}`),
  );
}
