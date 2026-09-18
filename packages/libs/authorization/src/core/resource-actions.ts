import type { AuthorizationDecision, AuthorizationRequest } from './types.js';
import type {
  AuthorizationRuntimeContext,
  ResourceActionScopes,
  ResourceTitle,
} from './registry.js';

export interface ResourceAction {
  name: string;
  title?: ResourceTitle;
  scope?: ResourceActionScopes;
  authorize(
    request: AuthorizationRequest<unknown>,
    context: AuthorizationRuntimeContext,
  ): Promise<AuthorizationDecision>;
  authorizeUnrestricted?(
    request: AuthorizationRequest<unknown>,
  ): Promise<AuthorizationDecision>;
}
export type ResourceActionDeclaration = string | ResourceAction;

/** Keeps executable action definitions separate from serializable item metadata. */
export class ResourceActionRegistry {
  private defaults = new Map<string, ResourceAction>();
  private readonly items = new Map<
    string,
    readonly ResourceActionDeclaration[]
  >();
  configure(actions: readonly ResourceAction[]): void {
    const defaults = new Map<string, ResourceAction>();
    for (const action of actions) {
      if (!action.name || defaults.has(action.name))
        throw new TypeError('Action names must be nonempty and unique');
      defaults.set(action.name, action);
    }
    for (const declarations of this.items.values())
      this.validate(declarations, defaults);
    this.defaults = defaults;
  }
  add(id: string, actions: readonly ResourceActionDeclaration[]): void {
    this.validate(actions, this.defaults);
    this.items.set(id, [...actions]);
  }
  private validate(
    actions: readonly ResourceActionDeclaration[],
    defaults: ReadonlyMap<string, ResourceAction>,
  ): void {
    const names = new Set<string>();
    for (const action of actions) {
      const name = typeof action === 'string' ? action : action.name;
      if (!name || names.has(name))
        throw new TypeError('Item action names must be nonempty and unique');
      if (typeof action === 'string' && defaults.size && !defaults.has(name))
        throw new TypeError(`Unknown inherited action: ${name}`);
      if (typeof action !== 'string' && typeof action.authorize !== 'function')
        throw new TypeError(`Action ${name} needs authorize`);
      names.add(name);
    }
  }
  resolve(id: string, name: string): ResourceAction | undefined {
    const declarations = this.items.get(id);
    if (!declarations) return this.defaults.get(name);
    const action = declarations.find(
      (action) => (typeof action === 'string' ? action : action.name) === name,
    );
    return typeof action === 'string' ? this.defaults.get(action) : action;
  }
  declares(id: string): boolean {
    return this.items.has(id);
  }
  names(): readonly string[] {
    return [...this.defaults.keys()];
  }
}
