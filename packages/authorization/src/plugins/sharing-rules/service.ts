import type {
  AccessConstraint,
  AccessConstraintResolver,
  AuthorizationSubject,
  ResolveAccessConstraintsInput,
} from '../../core/index.js';
import { resolveAuthorizationSubjects } from '../../core/index.js';
import type { SharingRule } from './model.js';
import type { SharingRuleStore } from './store.js';

export interface SharingRulesApi {
  create(rule: SharingRule): Promise<SharingRule>;
  update(key: string, rule: SharingRule): Promise<SharingRule>;
  delete(key: string): Promise<void>;
  get(key: string): Promise<SharingRule | undefined>;
  list(): Promise<readonly SharingRule[]>;
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

export class SharingRuleService
  implements SharingRulesApi, AccessConstraintResolver
{
  readonly id = 'sharing-rules';
  private store?: SharingRuleStore;

  constructor(store?: SharingRuleStore) {
    this.store = store;
  }

  initialize(store: SharingRuleStore): void {
    this.store = store;
  }

  create(rule: SharingRule): Promise<SharingRule> {
    return this.getStore().create(rule);
  }

  update(key: string, rule: SharingRule): Promise<SharingRule> {
    return this.getStore().update(key, rule);
  }

  delete(key: string): Promise<void> {
    return this.getStore().delete(key);
  }

  get(key: string): Promise<SharingRule | undefined> {
    return this.getStore().get(key);
  }

  list(): Promise<readonly SharingRule[]> {
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

  private getStore(): SharingRuleStore {
    if (!this.store) throw new Error('Sharing Rules has not been initialized');
    return this.store;
  }
}
