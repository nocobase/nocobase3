import type {
  AccessConstraint,
  AccessConstraintResolver,
  AuthorizationSubject,
  ResolveAccessConstraintsInput,
} from '../../core/index.js';
import { resolveAuthorizationSubjects } from '../../core/index.js';
import type { SharingRule } from './model.js';
import type { SharingRuleStore } from './store.js';

export interface SharingRulesApi<TTransaction = unknown> {
  create(rule: SharingRule): Promise<SharingRule>;
  update(key: string, rule: SharingRule): Promise<SharingRule>;
  delete(key: string): Promise<void>;
  get(key: string): Promise<SharingRule | undefined>;
  list(): Promise<readonly SharingRule[]>;
  /**
   * Returns an API bound to the caller's transaction. The caller opens and
   * commits the transaction.
   */
  withTransaction(transaction: TTransaction): SharingRulesApi<TTransaction>;
}

function sharesWithSubject(
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

export class SharingRuleService<TTransaction = unknown>
  implements SharingRulesApi<TTransaction>, AccessConstraintResolver
{
  readonly id = 'sharing-rules';

  constructor(private readonly store: SharingRuleStore<TTransaction>) {}

  withTransaction(transaction: TTransaction): SharingRulesApi<TTransaction> {
    return new SharingRuleService<TTransaction>(
      this.store.withTransaction(transaction),
    );
  }

  create(rule: SharingRule): Promise<SharingRule> {
    return this.store.create(rule);
  }

  update(key: string, rule: SharingRule): Promise<SharingRule> {
    return this.store.update(key, rule);
  }

  delete(key: string): Promise<void> {
    return this.store.delete(key);
  }

  get(key: string): Promise<SharingRule | undefined> {
    return this.store.get(key);
  }

  list(): Promise<readonly SharingRule[]> {
    return this.store.list();
  }

  scope(): AccessConstraintResolver {
    let rules: Promise<readonly SharingRule[]> | undefined;
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
    rules: readonly SharingRule[],
  ): readonly AccessConstraint[] {
    const subjects = resolveAuthorizationSubjects(input);
    return rules
      .flatMap((rule) => {
        const configured = rule.actions.find(
          (action) => action.action === input.action,
        );
        return rule.resource.type === input.resource.type &&
          (rule.resource.id === '*' ||
            rule.resource.id === input.resource.id) &&
          sharesWithSubject(rule.subjects, subjects) &&
          configured
          ? [{ rule, configured }]
          : [];
      })
      .map(({ rule, configured }) => ({
        source: { plugin: this.id, id: rule.key },
        effect: 'expand' as const,
        value:
          configured.selection.type === 'records'
            ? { type: 'ids' as const, ids: configured.selection.ids }
            : configured.selection.policy,
      }));
  }
}
