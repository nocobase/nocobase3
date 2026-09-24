import type {
  BusinessActions,
  BusinessResourceReference,
} from '../../core/business.js';
import type { RecordSelection } from '../../core/selection.js';
import type { AuthorizationTitle } from '../../core/titles.js';
import type { AuthorizationSubject } from '../../core/types.js';
import { appendRuleAction } from '../internal/rules.js';
import type { SharingRule } from './model.js';

export class SharingRuleBuilder<A extends BusinessActions> {
  constructor(
    private readonly resource: BusinessResourceReference<A>,
    private readonly definition: SharingRule,
  ) {}

  scope<N extends keyof A & string>(
    action: N,
    scopeKey: keyof A[N] & string,
    selection: RecordSelection,
  ): SharingRuleBuilder<A> {
    if (selection.type === 'all')
      throw new TypeError('A sharing rule cannot select all records');
    this.resource.scope(action, scopeKey);
    return new SharingRuleBuilder(this.resource, {
      ...this.definition,
      actions: appendRuleAction(this.definition.actions, {
        action,
        scopeKey,
        selection,
      }),
    });
  }

  title(title: AuthorizationTitle): SharingRuleBuilder<A> {
    return new SharingRuleBuilder(this.resource, { ...this.definition, title });
  }

  subjects(
    ...subjects: readonly AuthorizationSubject[]
  ): SharingRuleBuilder<A> {
    return new SharingRuleBuilder(this.resource, {
      ...this.definition,
      subjects: [...this.definition.subjects, ...structuredClone(subjects)],
    });
  }

  reason(reason: string): SharingRuleBuilder<A> {
    return new SharingRuleBuilder(this.resource, {
      ...this.definition,
      reason,
    });
  }

  build(): SharingRule {
    return structuredClone(this.definition);
  }
}

export function defineSharingRule<A extends BusinessActions>(
  key: string,
  resource: BusinessResourceReference<A>,
): SharingRuleBuilder<A> {
  if (!key) throw new TypeError('A rule needs a key');
  return new SharingRuleBuilder(resource, {
    key,
    resource: { type: 'business', id: resource.name },
    actions: [],
    subjects: [],
  });
}
