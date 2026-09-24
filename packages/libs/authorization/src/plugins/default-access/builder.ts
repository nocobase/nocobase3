import {
  COMPOSITE_RESOURCE_TYPE,
  type CompositeResourceActions,
  type CompositeResourceReference,
} from '../../core/composite.js';
import type { RecordSelection } from '../../core/selection.js';
import { appendRuleAction } from '../internal/rules.js';
import type { DefaultAccessRule } from './model.js';

export class DefaultAccessRuleBuilder<A extends CompositeResourceActions> {
  constructor(
    private readonly resource: CompositeResourceReference<A>,
    private readonly definition: DefaultAccessRule,
  ) {}

  scope<N extends keyof A & string>(
    action: N,
    scopeKey: keyof A[N] & string,
    selection: RecordSelection,
  ): DefaultAccessRuleBuilder<A> {
    this.resource.scope(action, scopeKey);
    return new DefaultAccessRuleBuilder(this.resource, {
      ...this.definition,
      actions: appendRuleAction(this.definition.actions, {
        action,
        scopeKey,
        selection,
      }),
    });
  }

  build(): DefaultAccessRule {
    return structuredClone(this.definition);
  }
}

export function defineDefaultAccessRule<A extends CompositeResourceActions>(
  key: string,
  resource: CompositeResourceReference<A>,
): DefaultAccessRuleBuilder<A> {
  if (!key) throw new TypeError('A rule needs a key');
  return new DefaultAccessRuleBuilder(resource, {
    key,
    resource: { type: COMPOSITE_RESOURCE_TYPE, id: resource.name },
    actions: [],
  });
}
