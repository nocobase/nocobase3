import type {
  BusinessActions,
  BusinessResourceReference,
} from '../../core/builders.js';
import { appendScopedAction } from '../internal/rule-builder.js';
import type { RestrictionRule, RestrictionRuleAction } from './model.js';
import type { AccessConstraintValue } from '../../core/constraints.js';
import type { AuthorizationTitle } from '../../core/titles.js';
import type { AuthorizationSubject } from '../../core/types.js';

export class RestrictionRuleBuilder<A extends BusinessActions> {
  constructor(
    private readonly resource: BusinessResourceReference<A>,
    private readonly definition: RestrictionRule,
  ) {}
  scope<N extends keyof A & string>(
    action: N,
    scopeKey: keyof A[N] & string,
    scope: AccessConstraintValue,
  ): RestrictionRuleBuilder<A> {
    return new RestrictionRuleBuilder(this.resource, {
      ...this.definition,
      actions: appendScopedAction<A, N, RestrictionRuleAction>(
        this.resource,
        this.definition.actions,
        action,
        scopeKey,
        { action, scopeKey, scope },
      ),
    });
  }
  title(title: AuthorizationTitle): RestrictionRuleBuilder<A> {
    return new RestrictionRuleBuilder(this.resource, {
      ...this.definition,
      title,
    });
  }
  subjects(
    ...subjects: readonly AuthorizationSubject[]
  ): RestrictionRuleBuilder<A> {
    return new RestrictionRuleBuilder(this.resource, {
      ...this.definition,
      subjects: [...this.definition.subjects, ...structuredClone(subjects)],
    });
  }
  reason(reason: string): RestrictionRuleBuilder<A> {
    return new RestrictionRuleBuilder(this.resource, {
      ...this.definition,
      reason,
    });
  }
  build(): RestrictionRule {
    return structuredClone(this.definition);
  }
}
export function restrictionRule<A extends BusinessActions>(
  key: string,
  resource: BusinessResourceReference<A>,
): RestrictionRuleBuilder<A> {
  if (!key) throw new TypeError('A rule needs a key');
  return new RestrictionRuleBuilder(resource, {
    key,
    subjects: [],
    resource: { type: 'resource', id: resource.name },
    actions: [],
  });
}
