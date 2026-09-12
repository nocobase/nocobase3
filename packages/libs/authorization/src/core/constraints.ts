import type {
  AuthorizationIdentity,
  AuthorizationSubject,
  Principal,
  ResourceRef,
} from './types.js';

export interface ResourceAccessScope {
  type: string;
  [key: string]: unknown;
}

export type AccessConstraintValue =
  | { type: 'all' }
  | { type: 'ids'; ids: readonly string[] }
  | ResourceAccessScope;

export interface AccessConstraint {
  source: { plugin: string; id: string };
  effect: 'expand' | 'restrict';
  value: AccessConstraintValue;
}

export interface ResolveAccessConstraintsInput {
  principal: Principal;
  subjects?: readonly AuthorizationSubject[];
  resource: ResourceRef;
  action: string;
}

export interface AccessConstraintResolver {
  id: string;
  resolve(
    input: ResolveAccessConstraintsInput,
  ): Promise<readonly AccessConstraint[]>;
}

export interface AccessConstraintService {
  resolve(
    input: ResolveAccessConstraintsInput,
  ): Promise<readonly AccessConstraint[]>;
}

export class AccessConstraintRegistry {
  private readonly resolvers = new Map<string, AccessConstraintResolver>();

  add(resolver: AccessConstraintResolver): void {
    if (this.resolvers.has(resolver.id)) {
      throw new Error(
        `Authorization constraint resolver already registered: ${resolver.id}`,
      );
    }
    this.resolvers.set(resolver.id, resolver);
  }

  async resolve(
    input: ResolveAccessConstraintsInput,
  ): Promise<readonly AccessConstraint[]> {
    const resolved = await Promise.all(
      [...this.resolvers.values()].map((resolver) => resolver.resolve(input)),
    );
    return resolved.flat();
  }

  list(): string[] {
    return [...this.resolvers.keys()].sort();
  }

  scope(identity: AuthorizationIdentity): AccessConstraintService {
    const cache = new Map<string, Promise<readonly AccessConstraint[]>>();
    return {
      resolve: (input) => {
        const key = `${input.resource.type}\u0000${input.resource.id}\u0000${input.action}`;
        let result = cache.get(key);
        if (!result) {
          result = this.resolve({
            ...input,
            principal: identity.principal,
            subjects: identity.subjects,
          });
          cache.set(key, result);
        }
        return result;
      },
    };
  }
}
