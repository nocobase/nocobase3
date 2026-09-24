import {
  COMPOSITE_RESOURCE_TYPE,
  type CompositeResourceActions,
  type CompositeResourceReference,
} from '../../core/composite.js';
import type { RecordSelection } from '../../core/selection.js';
import type { AuthorizationTitle } from '../../core/titles.js';
import type { AuthorizationSubject } from '../../core/types.js';
import { appendRuleAction } from '../internal/rules.js';
import type { RestrictionRule } from './model.js';

export class RestrictionRuleBuilder<A extends CompositeResourceActions> {
  constructor(
    private readonly resource: CompositeResourceReference<A>,
    private readonly definition: RestrictionRule,
  ) {}

  scope<N extends keyof A & string>(
    action: N,
    scopeKey: keyof A[N] & string,
    selection: RecordSelection,
  ): RestrictionRuleBuilder<A> {
    this.resource.scope(action, scopeKey);
    return new RestrictionRuleBuilder(this.resource, {
      ...this.definition,
      actions: appendRuleAction(this.definition.actions, {
        action,
        scopeKey,
        selection,
      }),
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

export function defineRestrictionRule<A extends CompositeResourceActions>(
  key: string,
  resource: CompositeResourceReference<A>,
): RestrictionRuleBuilder<A> {
  if (!key) throw new TypeError('A rule needs a key');
  return new RestrictionRuleBuilder(resource, {
    key,
    resource: { type: COMPOSITE_RESOURCE_TYPE, id: resource.name },
    actions: [],
    subjects: [],
  });
}
