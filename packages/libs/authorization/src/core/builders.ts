import type { PermissionGrant } from '../plugins/permission-sets/model.js';
import type {
  BusinessResource,
  BusinessResources,
  BusinessScopeSelection,
} from './business-resources.js';
import type { ResourceTitle } from './registry.js';

export type ActionScopes = NonNullable<
  BusinessResource['actions'][number]['scopes']
>;
/** Plugins build serializable grants and describe their configurable scopes. */
export interface AuthorizationContribution<
  S extends Record<string, BusinessScopeSelection> = Record<never, never>,
> {
  build(): { grants: readonly PermissionGrant[]; scopes?: ActionScopes };
  /** Type-only scope selections, carried from plugin builders into business grants. */
  readonly scopeSelections?: S;
}

type ContributionScopes<C extends AuthorizationContribution> =
  'scopeSelections' extends keyof C
    ? NonNullable<C['scopeSelections']>
    : Record<never, never>;

export class BusinessActionBuilder<
  S extends Record<string, BusinessScopeSelection> = Record<never, never>,
> implements AuthorizationContribution<S> {
  declare readonly scopeSelections?: S;
  constructor(
    private readonly grants: readonly PermissionGrant[] = [],
    private readonly scopes: ActionScopes = {},
  ) {
    this.grants = structuredClone(grants);
    this.scopes = structuredClone(scopes);
  }
  grant<C extends AuthorizationContribution>(
    value: C,
  ): BusinessActionBuilder<S & ContributionScopes<C>> {
    const contribution = value.build();
    const scopes = { ...this.scopes };
    for (const [key, scope] of Object.entries(contribution.scopes ?? {})) {
      if (Object.hasOwn(scopes, key))
        throw new TypeError(`Duplicate action scope: ${key}`);
      Object.defineProperty(scopes, key, { value: scope, enumerable: true });
    }
    return new BusinessActionBuilder(
      [...this.grants, ...contribution.grants],
      scopes,
    );
  }
  build(): { grants: readonly PermissionGrant[]; scopes: ActionScopes } {
    return structuredClone({ grants: this.grants, scopes: this.scopes });
  }
}

export type BusinessActions = Record<
  string,
  Record<string, BusinessScopeSelection>
>;
type ScopeAssignments<S> = keyof S extends never
  ? Record<string, never>
  : Partial<S>;
type ActionAssignments<A extends BusinessActions> = {
  [K in keyof A]?: ScopeAssignments<A[K]>;
};
export class BusinessResourceReference<A extends BusinessActions> {
  constructor(private readonly definition: BusinessResource) {}
  get name(): string {
    return this.definition.name;
  }
  scope<N extends keyof A & string>(
    action: N,
    key: keyof A[N] & string,
  ): { action: N; scopeKey: keyof A[N] & string } {
    if (
      !this.definition.actions.find((entry) => entry.name === action)?.scopes?.[
        key
      ]
    )
      throw new TypeError('Unknown business action scope');
    return { action, scopeKey: key };
  }
  grant(
    action: keyof A & string,
    ...actions: (keyof A & string)[]
  ): PermissionGrant;
  grant(actions: ActionAssignments<A>): PermissionGrant;
  grant(...input: (string | ActionAssignments<A>)[]): PermissionGrant {
    const first = input[0];
    return buildBusinessGrant(
      this.definition,
      typeof first === 'object'
        ? (first as Record<string, Record<string, BusinessScopeSelection>>)
        : (input as string[]),
    );
  }
}

export class BusinessResourceBuilder<
  A extends BusinessActions = Record<never, never>,
> {
  constructor(
    private readonly registry: BusinessResources | undefined,
    private readonly definition: BusinessResource,
  ) {
    this.definition = structuredClone(definition);
  }
  action<const N extends string, C extends AuthorizationContribution>(
    name: N extends keyof A ? never : N,
    metadata: { title: ResourceTitle },
    configure: (action: BusinessActionBuilder) => C,
  ): BusinessResourceBuilder<A & Record<N, ContributionScopes<C>>> {
    const contribution = configure(new BusinessActionBuilder()).build();
    return new BusinessResourceBuilder(this.registry, {
      ...this.definition,
      actions: [
        ...this.definition.actions,
        { name, ...metadata, ...contribution },
      ],
    });
  }
  build(): BusinessResource {
    return structuredClone(this.definition);
  }
  reference(): BusinessResourceReference<A> {
    return new BusinessResourceReference(this.build());
  }
  register(
    registry: BusinessResources | undefined = this.registry,
  ): BusinessResourceReference<A> {
    if (!registry) throw new Error('A business resource registry is required');
    registry.add(this.build());
    return this.reference();
  }
}

export class BusinessGroupReference {
  constructor(
    readonly name: string,
    private readonly registry: BusinessResources,
  ) {}
  resource(
    name: string,
    metadata: { title: ResourceTitle },
  ): BusinessResourceBuilder {
    return new BusinessResourceBuilder(this.registry, {
      name,
      ...metadata,
      group: this.name,
      actions: [],
    });
  }
}

/** A portable declaration, independent of an application or registry. */
export function businessResource(
  name: string,
  metadata: { title: ResourceTitle; group: string },
): BusinessResourceBuilder {
  return new BusinessResourceBuilder(undefined, {
    name,
    ...metadata,
    actions: [],
  });
}

export function buildBusinessGrant(
  definition: BusinessResource,
  actions:
    | readonly string[]
    | Readonly<
        Record<string, Readonly<Record<string, BusinessScopeSelection>>>
      >,
): PermissionGrant {
  if (
    (Array.isArray(actions) ? actions : Object.keys(actions)).some(
      (action) => !definition.actions.some((item) => item.name === action),
    )
  )
    throw new TypeError('Unknown business resource or action');
  return structuredClone({
    resource: { type: 'resource', id: definition.name },
    actions: Array.isArray(actions)
      ? actions.map((action: string) => ({ action }))
      : Object.entries(
          actions as Readonly<
            Record<string, Readonly<Record<string, BusinessScopeSelection>>>
          >,
        ).map(([action, scopes]) => ({
          action,
          policy: { type: 'resource', ...scopes },
        })),
  });
}
