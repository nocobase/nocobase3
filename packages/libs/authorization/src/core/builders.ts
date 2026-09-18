import { buildResourceGrant } from './resource-grant.js';
import type { PermissionGrant } from '../plugins/permission-sets/model.js';
import type {
  AuthorizationResource,
  AuthorizationResources,
  RecordAccessSelection,
} from './resources.js';
import type { ResourceTitle } from './registry.js';

export type ActionScopes = NonNullable<
  AuthorizationResource['actions'][number]['scopes']
>;
/** Plugins build serializable grants and describe their configurable scopes. */
export interface AuthorizationContribution<
  S extends Record<string, RecordAccessSelection> = Record<never, never>,
> {
  build(): { grants: readonly PermissionGrant[]; scopes?: ActionScopes };
  /** Type-only scope selections, carried from plugin builders into business grants. */
  readonly scopeSelections?: S;
}

type ContributionScopes<C extends AuthorizationContribution> =
  'scopeSelections' extends keyof C
    ? NonNullable<C['scopeSelections']>
    : Record<never, never>;

/** A plugin-owned permission that can be bound to an action's configuration key. */
export interface BindableAuthorizationPermission {
  readonly recordAccessSelection?: RecordAccessSelection;
  bind<K extends string>(
    key: K,
    metadata?: { title?: ResourceTitle },
  ): AuthorizationContribution<Record<K, RecordAccessSelection>>;
}

export class AuthorizationActionBuilder<
  S extends Record<string, RecordAccessSelection> = Record<never, never>,
> implements AuthorizationContribution<S> {
  declare readonly scopeSelections?: S;
  constructor(
    private readonly grants: readonly PermissionGrant[] = [],
    private readonly scopes: ActionScopes = {},
    private readonly actionTitle: ResourceTitle | undefined = undefined,
  ) {
    this.grants = structuredClone(grants);
    this.scopes = structuredClone(scopes);
    this.actionTitle = structuredClone(actionTitle);
  }
  title(title: ResourceTitle): AuthorizationActionBuilder<S> {
    return new AuthorizationActionBuilder(this.grants, this.scopes, title);
  }
  grant<C extends AuthorizationContribution>(
    value: C,
  ): AuthorizationActionBuilder<S & ContributionScopes<C>>;
  grant<const K extends string, P extends BindableAuthorizationPermission>(
    key: K extends keyof S ? never : K,
    permission: P,
    metadata?: { title?: ResourceTitle },
  ): AuthorizationActionBuilder<
    S &
      Record<
        K,
        'recordAccessSelection' extends keyof P
          ? NonNullable<P['recordAccessSelection']>
          : RecordAccessSelection
      >
  >;
  grant(
    valueOrKey: AuthorizationContribution | string,
    permission?: BindableAuthorizationPermission,
    metadata?: { title?: ResourceTitle },
  ): AuthorizationActionBuilder<S> {
    const value =
      typeof valueOrKey === 'string'
        ? permission?.bind(valueOrKey, metadata)
        : valueOrKey;
    if (!value) throw new TypeError('A permission is required');
    const contribution = value.build();
    const scopes = { ...this.scopes };
    for (const [key, scope] of Object.entries(contribution.scopes ?? {})) {
      if (Object.hasOwn(scopes, key))
        throw new TypeError(`Duplicate action scope: ${key}`);
      Object.defineProperty(scopes, key, { value: scope, enumerable: true });
    }
    return new AuthorizationActionBuilder(
      [...this.grants, ...contribution.grants],
      scopes,
      this.actionTitle,
    );
  }
  build(): {
    grants: readonly PermissionGrant[];
    scopes: ActionScopes;
    title?: ResourceTitle;
  } {
    return structuredClone({
      grants: this.grants,
      scopes: this.scopes,
      ...(this.actionTitle === undefined ? {} : { title: this.actionTitle }),
    });
  }
}

export type AuthorizationActions = Record<
  string,
  Record<string, RecordAccessSelection>
>;
type ScopeAssignments<S> = keyof S extends never
  ? Record<string, never>
  : Partial<S>;
type ActionAssignments<A extends AuthorizationActions> = {
  [K in keyof A]?: ScopeAssignments<A[K]>;
};
export class AuthorizationResourceReference<A extends AuthorizationActions> {
  constructor(private readonly definition: AuthorizationResource) {}
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
    return buildResourceGrant(
      this.definition,
      typeof first === 'object'
        ? (first as Record<string, Record<string, RecordAccessSelection>>)
        : (input as string[]),
    );
  }
}

export class AuthorizationResourceBuilder<
  A extends AuthorizationActions = Record<never, never>,
> {
  constructor(private readonly definition: AuthorizationResource) {
    this.definition = structuredClone(definition);
  }
  title(title: ResourceTitle): AuthorizationResourceBuilder<A> {
    return new AuthorizationResourceBuilder({
      ...this.definition,
      title,
    });
  }
  group(group: string): AuthorizationResourceBuilder<A> {
    return new AuthorizationResourceBuilder({
      ...this.definition,
      group,
    });
  }
  action<const N extends string, C extends AuthorizationContribution>(
    name: N extends keyof A ? never : N,
    configure: (action: AuthorizationActionBuilder) => C,
  ): AuthorizationResourceBuilder<A & Record<N, ContributionScopes<C>>> {
    if (!name || this.definition.actions.some((action) => action.name === name))
      throw new TypeError('Duplicate or empty resource action');
    const contribution = configure(new AuthorizationActionBuilder()).build();
    const title =
      'title' in contribution ? (contribution.title as ResourceTitle) : name;
    return new AuthorizationResourceBuilder({
      ...this.definition,
      actions: [...this.definition.actions, { ...contribution, name, title }],
    });
  }
  build(): AuthorizationResource {
    return structuredClone(this.definition);
  }
  reference(): AuthorizationResourceReference<A> {
    return new AuthorizationResourceReference(this.build());
  }
  register(
    registry: AuthorizationResources,
  ): AuthorizationResourceReference<A> {
    registry.add(this.build());
    return this.reference();
  }
}

/** Build a portable resource without registering it into an application. */
export function defineAuthorizationResource<A extends AuthorizationActions>(
  name: string,
  configure: (
    resource: AuthorizationResourceBuilder,
  ) => AuthorizationResourceBuilder<A>,
): AuthorizationResourceBuilder<A> {
  if (!name) throw new TypeError('A resource name is required');
  const result = configure(
    new AuthorizationResourceBuilder({
      name,
      title: name,
      group: '',
      actions: [],
    }),
  );
  const definition = result.build();
  if (!definition.group || !definition.actions.length)
    throw new TypeError('A resource requires a group and actions');
  return new AuthorizationResourceBuilder(definition);
}
