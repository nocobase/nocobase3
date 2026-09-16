import type {
  AccessConstraint,
  AccessConstraintResolver,
  AuthorizationSubject,
  ResolveAccessConstraintsInput,
} from '../../core/index.js';
import { resolveAuthorizationSubjects } from '../../core/index.js';
import type { RestrictionRule } from './model.js';
import type { RestrictionRuleStore } from './store.js';

export interface RestrictionRulesApi<TTransaction = unknown> {
  create(rule: RestrictionRule): Promise<RestrictionRule>;
  update(key: string, rule: RestrictionRule): Promise<RestrictionRule>;
  delete(key: string): Promise<void>;
  get(key: string): Promise<RestrictionRule | undefined>;
  list(): Promise<readonly RestrictionRule[]>;
  /**
   * Returns an API bound to the caller's transaction. The caller opens and
   * commits the transaction.
   */
  withTransaction(transaction: TTransaction): RestrictionRulesApi<TTransaction>;
}

export class RestrictionRuleService<TTransaction = unknown>
  implements RestrictionRulesApi<TTransaction>, AccessConstraintResolver
{
  readonly id = 'restriction-rules';

  constructor(private readonly store: RestrictionRuleStore<TTransaction>) {}
  withTransaction(
    transaction: TTransaction,
  ): RestrictionRulesApi<TTransaction> {
    return new RestrictionRuleService<TTransaction>(
      this.store.withTransaction(transaction),
    );
  }
  create(rule: RestrictionRule): Promise<RestrictionRule> {
    return this.store.create(rule);
  }
  update(key: string, rule: RestrictionRule): Promise<RestrictionRule> {
    return this.store.update(key, rule);
  }
  delete(key: string): Promise<void> {
    return this.store.delete(key);
  }
  get(key: string): Promise<RestrictionRule | undefined> {
    return this.store.get(key);
  }
  list(): Promise<readonly RestrictionRule[]> {
    return this.store.list();
  }

  scope(): AccessConstraintResolver {
    let rules: Promise<readonly RestrictionRule[]> | undefined;
    return {
      id: this.id,
      resolve: async (input) =>
        this.resolveRules(input, await (rules ??= this.store.list())),
    };
  }

  async resolve(
    input: ResolveAccessConstraintsInput,
  ): Promise<readonly AccessConstraint[]> {
    return this.resolveRules(input, await this.store.list());
  }

  private resolveRules(
    input: ResolveAccessConstraintsInput,
    rules: readonly RestrictionRule[],
  ): readonly AccessConstraint[] {
    const subjects = resolveAuthorizationSubjects(input);
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
