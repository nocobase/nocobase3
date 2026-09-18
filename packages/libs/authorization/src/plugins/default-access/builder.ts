import type {
  BusinessActions,
  BusinessResourceReference,
} from '../../core/builders.js';
import { appendScopedAction } from '../internal/rule-builder.js';
import type { DefaultAccessRule, DefaultAccessAction } from './model.js';
import type { AccessConstraintValue } from '../../core/constraints.js';

export class DefaultAccessRuleBuilder<A extends BusinessActions> {
  constructor(
    private readonly resource: BusinessResourceReference<A>,
    private readonly definition: DefaultAccessRule,
  ) {}
  scope<N extends keyof A & string>(
    action: N,
    scopeKey: keyof A[N] & string,
    scope: AccessConstraintValue,
  ): DefaultAccessRuleBuilder<A> {
    return new DefaultAccessRuleBuilder(this.resource, {
      ...this.definition,
      actions: appendScopedAction<A, N, DefaultAccessAction>(
        this.resource,
        this.definition.actions,
        action,
        scopeKey,
        { action, scopeKey, scope },
      ),
    });
  }
  build(): DefaultAccessRule {
    return structuredClone(this.definition);
  }
}
export function defaultAccessRule<A extends BusinessActions>(
  resource: BusinessResourceReference<A>,
): DefaultAccessRuleBuilder<A> {
  return new DefaultAccessRuleBuilder(resource, {
    resource: { type: 'resource', id: resource.name },
    actions: [],
  });
}
