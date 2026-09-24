import type {
  BusinessActions,
  BusinessResourceReference,
} from '../../core/business.js';
import type { RecordSelection } from '../../core/selection.js';
import { appendRuleAction } from '../internal/rules.js';
import type { DefaultAccessRule } from './model.js';

export class DefaultAccessRuleBuilder<A extends BusinessActions> {
  constructor(
    private readonly resource: BusinessResourceReference<A>,
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

export function defineDefaultAccessRule<A extends BusinessActions>(
  key: string,
  resource: BusinessResourceReference<A>,
): DefaultAccessRuleBuilder<A> {
  if (!key) throw new TypeError('A rule needs a key');
  return new DefaultAccessRuleBuilder(resource, {
    key,
    resource: { type: 'business', id: resource.name },
    actions: [],
  });
}
