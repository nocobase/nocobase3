import { buildResourceGrant } from './resource-grant.js';
import type { PermissionGrant } from '../plugins/permission-sets/model.js';
import type { AccessConstraintService } from './constraints.js';
import type {
  AuthorizationGrant,
  AuthorizationGrantService,
} from './grants.js';
import { type ResourceTitle } from './registry.js';
import type {
  AuthorizationConditions,
  AuthorizationDecision,
  ResourceRef,
} from './types.js';

/** Underlying checks for one composed operation, restricted to that operation's grants. */
export interface ResourceAuthorizationCheck {
  resource: ResourceRef;
  action: string;
  decision: AuthorizationDecision;
}

/** Plugins contribute executable conditions without coupling core to their runtime. */
export interface ResourceAuthorizationConditions extends AuthorizationConditions {
  type: 'resource';
  checks: readonly ResourceAuthorizationCheck[];
}

export type RecordAccessSelection =
  string | { readonly key: string; readonly params?: unknown };

export interface AuthorizationResourceGroup {
  category?: 'business' | 'administration';
  name: string;
  title: ResourceTitle;
}
export interface AuthorizationResource {
  name: string;
  title: ResourceTitle;
  group: string;
  actions: readonly {
    name: string;
    title: ResourceTitle;
    scopes?: Readonly<
      Record<
        string,
        {
          title: ResourceTitle;
          resource: ResourceRef;
          options?: readonly string[];
          defaultValue?: string;
        }
      >
    >;
    grants: readonly PermissionGrant[];
  }[];
}
export class AuthorizationResourceGroups {
  private entries = new Map<string, AuthorizationResourceGroup>();
  add(value: AuthorizationResourceGroup): void {
    if (
      value.category &&
      !['business', 'administration'].includes(value.category)
    )
      throw new TypeError('Invalid resource group category');
    if (!value.name || this.entries.has(value.name))
      throw new TypeError('Duplicate or empty business group');
    this.entries.set(value.name, structuredClone(value));
  }
  has(name: string): boolean {
    return this.entries.has(name);
  }
  list(): readonly AuthorizationResourceGroup[] {
    return structuredClone([...this.entries.values()]);
  }
}
/** User-facing operations compose underlying resource types. */
export class AuthorizationResources {
  private definitions = new Map<string, AuthorizationResource>();
  constructor(private groups: AuthorizationResourceGroups) {}
  add(definition: AuthorizationResource): void {
    if (
      !definition.name ||
      this.definitions.has(definition.name) ||
      !this.groups.has(definition.group)
    )
      throw new TypeError('Invalid business resource name or group');
    const business =
      this.groups.list().find((group) => group.name === definition.group)
        ?.category !== 'administration';
    for (const action of definition.actions) {
      if (action.grants.some((grant) => grant.resource.type === 'page'))
        throw new TypeError(
          'Page access must be granted separately from composed operations',
        );
      if (
        business &&
        action.grants.some(
          (grant) => grant.resource.type !== 'database.collection',
        )
      )
        throw new TypeError(
          'Business actions must only reference database collections',
        );
    }
    const names = definition.actions.map((action) => action.name);
    if (
      !names.length ||
      names.some((name) => !name) ||
      new Set(names).size !== names.length
    )
      throw new TypeError('Invalid business actions');
    if (
      definition.actions.some(
        (action) =>
          !action.grants.length ||
          action.grants.some((grant) => grant.resource.type === 'resource'),
      )
    )
      throw new TypeError(
        'Business actions must reference underlying resources',
      );
    for (const action of definition.actions) {
      for (const [key, scope] of Object.entries(action.scopes ?? {})) {
        if (
          !key ||
          key === 'type' ||
          scope.resource.type !== 'database.collection' ||
          (scope.options !== undefined && !scope.options.length) ||
          (scope.options !== undefined &&
            new Set(scope.options).size !== scope.options.length) ||
          (scope.defaultValue !== undefined &&
            scope.options !== undefined &&
            !scope.options.includes(scope.defaultValue))
        )
          throw new TypeError('Invalid business action scope');
        if (
          !action.grants.some(
            (target) =>
              target.resource.type === scope.resource.type &&
              target.resource.id === scope.resource.id &&
              target.actions.some(
                (operation) => operation.policy?.scope === key,
              ),
          )
        )
          throw new TypeError(
            'Business scope must be used by a matching grant',
          );
      }
      for (const target of action.grants)
        for (const operation of target.actions) {
          const key = operation.policy?.scope;
          if (key === undefined) continue;
          const scope =
            typeof key === 'string' ? action.scopes?.[key] : undefined;
          if (
            !scope ||
            target.resource.type !== scope.resource.type ||
            target.resource.id !== scope.resource.id
          )
            throw new TypeError(
              'Grant scope does not match its underlying resource',
            );
        }
    }
    this.definitions.set(definition.name, structuredClone(definition));
  }
  operation(
    resource: string,
    action: string,
  ): AuthorizationResource['actions'][number] | undefined {
    return this.definitions
      .get(resource)
      ?.actions.find((entry) => entry.name === action);
  }
  definitionsList(): readonly AuthorizationResource[] {
    return structuredClone([...this.definitions.values()]);
  }
  grant(
    name: string,
    actions:
      | readonly string[]
      | Readonly<
          Record<string, Readonly<Record<string, RecordAccessSelection>>>
        >,
  ): PermissionGrant {
    const definition = this.definitions.get(name);
    if (!definition) throw new TypeError('Unknown business resource or action');
    return buildResourceGrant(definition, actions);
  }
  expand(grant: AuthorizationGrant): readonly AuthorizationGrant[] {
    if (grant.resource.type !== 'resource') return [grant];
    const action = this.definitions
      .get(grant.resource.id)
      ?.actions.find((action) => action.name === grant.action);
    if (!action || (grant.policy && grant.policy.type !== 'resource'))
      throw new TypeError('Invalid business resource grant');
    for (const key of Object.keys(grant.policy ?? {}))
      if (key !== 'type' && !action.scopes?.[key])
        throw new TypeError(`Unknown action scope: ${key}`);
    for (const [key, scope] of Object.entries(action.scopes ?? {})) {
      const selected = grant.policy?.[key] ?? scope.defaultValue;
      const selectedKey =
        typeof selected === 'string'
          ? selected
          : selected && typeof selected === 'object' && !Array.isArray(selected)
            ? (Reflect.get(selected, 'key') as unknown)
            : undefined;
      if (
        selected !== undefined &&
        selected !== '' &&
        (typeof selectedKey !== 'string' ||
          (scope.options !== undefined && !scope.options.includes(selectedKey)))
      )
        throw new TypeError('Unknown scope option');
    }
    return [
      grant,
      ...action.grants.flatMap((target) =>
        target.actions.map((operation) => {
          const scopeKey = operation.policy?.scope;
          const selected =
            typeof scopeKey === 'string'
              ? (grant.policy?.[scopeKey] ??
                action.scopes?.[scopeKey]?.defaultValue)
              : undefined;
          return {
            ...grant,
            resource: target.resource,
            action: operation.action,
            policy: operation.policy && {
              ...operation.policy,
              ...(selected !== undefined && selected !== ''
                ? { recordAccess: [selected] }
                : {}),
            },
            origin: {
              resource: grant.resource,
              action: grant.action,
              ...(typeof scopeKey === 'string' ? { scopeKey } : {}),
            },
          };
        }),
      ),
    ];
  }
}
export function composedGrants(
  provider: AuthorizationGrantService,
  resources: AuthorizationResources,
  constraints: AccessConstraintService,
): AuthorizationGrantService {
  const expand = async (
    grants: readonly AuthorizationGrant[],
    input: Parameters<AuthorizationGrantService['resolveAll']>[0],
  ) =>
    Promise.all(
      grants
        .flatMap((grant) => resources.expand(grant))
        .map(async (grant) => {
          if (!grant.origin?.scopeKey) return grant;
          const branchConstraints = await constraints.resolve({
            ...input,
            ...grant.origin,
          });
          return {
            ...grant,
            policy: {
              ...grant.policy,
              type: grant.policy?.type ?? 'database',
              branchConstraints,
            },
          };
        }),
    );
  return {
    resolveAll: async (input) =>
      expand(await provider.resolveAll(input), input),
    resolve: async (input) => {
      const direct = await provider.resolve(input);
      const business = resources.definitionsList().length
        ? (await provider.resolveAll(input)).filter(
            (grant) => grant.resource.type === 'resource',
          )
        : [];
      const expanded = (await expand(business, input)).filter(
        (grant) => grant.resource.type !== 'resource',
      );
      // Validate business policies even when only checking the feature itself.
      if (input.resource.type === 'resource')
        direct.forEach((grant) => resources.expand(grant));
      return [...direct, ...expanded].filter(
        (grant) =>
          grant.resource.type === input.resource.type &&
          (grant.resource.id === '*' ||
            grant.resource.id === input.resource.id) &&
          grant.action === input.action,
      );
    },
    unrestricted: provider.unrestricted?.bind(provider),
    onChange: provider.onChange?.bind(provider),
    scope: (identity) =>
      composedGrants(
        provider.scope?.(identity) ?? provider,
        resources,
        constraints,
      ),
  };
}
