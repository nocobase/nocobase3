import type {
  AuthorizationActions,
  AuthorizationResourceReference,
} from '../../core/builders.js';
import { appendScopedAction } from '../internal/rule-builder.js';
import type {
  SharingRule,
  SharingRuleAction,
  SharingSelection,
} from './model.js';
import type { AuthorizationTitle } from '../../core/titles.js';
import type { AuthorizationSubject } from '../../core/types.js';

export class SharingRuleBuilder<A extends AuthorizationActions> {
  constructor(
    private readonly resource: AuthorizationResourceReference<A>,
    private readonly definition: SharingRule,
  ) {}
  scope<N extends keyof A & string>(
    action: N,
    scopeKey: keyof A[N] & string,
    selection: SharingSelection,
  ): SharingRuleBuilder<A> {
    return new SharingRuleBuilder(this.resource, {
      ...this.definition,
      actions: appendScopedAction<A, N, SharingRuleAction>(
        this.resource,
        this.definition.actions,
        action,
        scopeKey,
        { action, scopeKey, selection },
      ),
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
export function sharingRule<A extends AuthorizationActions>(
  key: string,
  resource: AuthorizationResourceReference<A>,
): SharingRuleBuilder<A> {
  if (!key) throw new TypeError('A rule needs a key');
  return new SharingRuleBuilder(resource, {
    key,
    subjects: [],
    resource: { type: 'resource', id: resource.name },
    actions: [],
  });
}
