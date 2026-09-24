import type { AccessConstraintService } from './constraints.js';
import type {
  AuthorizationGrant,
  AuthorizationGrantService,
  AuthorizationPolicy,
  PermissionGrant,
  PermissionGrantAction,
} from './grants.js';
import type { AuthorizationPlugin } from './plugin.js';
import { ResourceItems } from './resource-types.js';
import { parseRecordSelection, type RecordSelection } from './selection.js';
import type { AuthorizationTitle } from './titles.js';
import type {
  AuthorizationConditions,
  AuthorizationDecision,
  ResourceRef,
} from './types.js';

/** The stored resource type of every business resource. */
export const BUSINESS_RESOURCE_TYPE = 'business';
const COLLECTION_TYPE = 'database.collection';

/** A named slot on a business action that a grant or rule fills with records. */
export interface DataScope {
  readonly key: string;
  readonly title: AuthorizationTitle;
  readonly collection: string;
  /** Record access keys a grant may choose from. Absent means any. */
  readonly options?: readonly string[];
  /** The record access key used when a grant chooses nothing. */
  readonly defaultValue?: string;
}

/**
 * A record selection, or a record access key as shorthand. The empty string
 * selects nothing, not even the scope's default: only rules apply.
 */
export type DataScopeValue = RecordSelection | string;

export interface BusinessGrantAction extends PermissionGrantAction {
  /** The data scope this action's records are chosen by. */
  scopeKey?: string;
}

export interface BusinessGrant {
  resource: ResourceRef;
  actions: readonly BusinessGrantAction[];
}

export interface BusinessAction {
  name: string;
  title: AuthorizationTitle;
  dataScopes?: readonly DataScope[];
  grants: readonly BusinessGrant[];
}

/** A user-facing feature composed from collection grants. */
export interface BusinessResource {
  name: string;
  title: AuthorizationTitle;
  /** The subsection it is listed under; omitted, it lands in the business section's "Other". */
  section?: string;
  actions: readonly BusinessAction[];
}

/** The policy of a business grant: one value per data scope it sets. */
export interface BusinessPolicy extends AuthorizationPolicy {
  type: 'business';
  scopes: Readonly<Record<string, DataScopeValue>>;
}

/** One underlying check of a business action, made with that action's grants. */
export interface BusinessCheck {
  resource: ResourceRef;
  action: string;
  decision: AuthorizationDecision;
}

/** Plugins extend this through `composeConditions`. */
export interface BusinessConditions extends AuthorizationConditions {
  type: 'business';
  checks: readonly BusinessCheck[];
}

export interface BusinessContributionData {
  grants: readonly BusinessGrant[];
  dataScopes?: readonly DataScope[];
}

/** What a business action is built from; `S` carries data scope value types. */
export interface BusinessContribution<
  S extends Record<string, DataScopeValue> = Record<never, never>,
> {
  build(): BusinessContributionData;
  /** Type-only: the values each data scope of this contribution accepts. */
  readonly scopeSelections?: S;
}

/** A plugin-owned permission that becomes a data scope once bound to a key. */
export interface BindableBusinessPermission {
  /** Type-only: the values the bound data scope accepts. */
  readonly recordAccessSelection?: DataScopeValue;
  bind<K extends string>(
    key: K,
    metadata?: { title?: AuthorizationTitle },
  ): BusinessContribution<Record<K, DataScopeValue>>;
}

type ContributionScopes<C extends BusinessContribution> =
  'scopeSelections' extends keyof C
    ? NonNullable<C['scopeSelections']>
    : Record<never, never>;

export interface BusinessActionData {
  title?: AuthorizationTitle;
  grants: readonly BusinessGrant[];
  dataScopes: readonly DataScope[];
}

export class BusinessActionBuilder<
  S extends Record<string, DataScopeValue> = Record<never, never>,
> implements BusinessContribution<S> {
  declare readonly scopeSelections?: S;
  private readonly data: BusinessActionData;

  constructor(data: BusinessActionData = { grants: [], dataScopes: [] }) {
    this.data = structuredClone(data);
  }

  title(title: AuthorizationTitle): BusinessActionBuilder<S> {
    return new BusinessActionBuilder({ ...this.data, title });
  }

  grant<C extends BusinessContribution>(
    contribution: C,
  ): BusinessActionBuilder<S & ContributionScopes<C>>;
  grant<const K extends string, P extends BindableBusinessPermission>(
    key: K extends keyof S ? never : K,
    permission: P,
    metadata?: { title?: AuthorizationTitle },
  ): BusinessActionBuilder<
    S &
      Record<
        K,
        'recordAccessSelection' extends keyof P
          ? NonNullable<P['recordAccessSelection']>
          : DataScopeValue
      >
  >;
  grant(
    valueOrKey: BusinessContribution | string,
    permission?: BindableBusinessPermission,
    metadata?: { title?: AuthorizationTitle },
  ): BusinessActionBuilder<S> {
    const contribution =
      typeof valueOrKey === 'string'
        ? permission?.bind(valueOrKey, metadata)
        : valueOrKey;
    if (!contribution) throw new TypeError('A permission is required');
    const built = contribution.build();
    const dataScopes = [...this.data.dataScopes];
    for (const scope of built.dataScopes ?? []) {
      if (dataScopes.some((entry) => entry.key === scope.key))
        throw new TypeError(`Duplicate data scope: ${scope.key}`);
      dataScopes.push(scope);
    }
    return new BusinessActionBuilder({
      ...this.data,
      grants: [...this.data.grants, ...built.grants],
      dataScopes,
    });
  }

  build(): BusinessActionData {
    return structuredClone(this.data);
  }
}

/** Data scope values per action, as the reference types them. */
export type BusinessActions = Record<string, Record<string, DataScopeValue>>;

type ScopeAssignments<S> = keyof S extends never
  ? Record<string, never>
  : Partial<S>;

export type BusinessActionAssignments<A extends BusinessActions> = {
  [K in keyof A]?: ScopeAssignments<A[K]>;
};

export interface BusinessScopeTarget<N extends string, K extends string> {
  action: N;
  scopeKey: K;
}

/** Type-safe grants and rule targets for one business resource. */
export class BusinessResourceReference<A extends BusinessActions> {
  private readonly definition: BusinessResource;

  constructor(definition: BusinessResource) {
    this.definition = structuredClone(definition);
  }

  get name(): string {
    return this.definition.name;
  }

  scope<N extends keyof A & string, K extends keyof A[N] & string>(
    action: N,
    key: K,
  ): BusinessScopeTarget<N, K> {
    if (
      !this.definition.actions
        .find((entry) => entry.name === action)
        ?.dataScopes?.some((scope) => scope.key === key)
    )
      throw new TypeError(`Unknown business data scope: ${action}.${key}`);
    return { action, scopeKey: key };
  }

  grant(
    action: keyof A & string,
    ...actions: (keyof A & string)[]
  ): PermissionGrant;
  grant(actions: BusinessActionAssignments<A>): PermissionGrant;
  grant(...input: (string | BusinessActionAssignments<A>)[]): PermissionGrant {
    const first = input[0];
    const entries: [string, Readonly<Record<string, DataScopeValue>>][] =
      typeof first === 'object'
        ? Object.entries(first).map(([action, scopes]) => [
            action,
            (scopes ?? {}) as Readonly<Record<string, DataScopeValue>>,
          ])
        : (input as string[]).map((action) => [action, {}]);
    return businessGrant(this.definition, entries);
  }
}

function businessGrant(
  definition: BusinessResource,
  entries: readonly [string, Readonly<Record<string, DataScopeValue>>][],
): PermissionGrant {
  const actions = entries.map(([name, scopes]): PermissionGrantAction => {
    const action = definition.actions.find((entry) => entry.name === name);
    if (!action)
      throw new TypeError(
        `Unknown business action: ${definition.name}.${name}`,
      );
    for (const [key, value] of Object.entries(scopes))
      validateScopeValue(action, key, value);
    return Object.keys(scopes).length
      ? {
          action: name,
          policy: { type: 'business', scopes: structuredClone(scopes) },
        }
      : { action: name };
  });
  return {
    resource: { type: BUSINESS_RESOURCE_TYPE, id: definition.name },
    actions,
  };
}

export class BusinessResourceBuilder<
  A extends BusinessActions = Record<never, never>,
> {
  private readonly definition: BusinessResource;

  constructor(definition: BusinessResource) {
    this.definition = structuredClone(definition);
  }

  title(title: AuthorizationTitle): BusinessResourceBuilder<A> {
    return new BusinessResourceBuilder({ ...this.definition, title });
  }

  section(section: string): BusinessResourceBuilder<A> {
    return new BusinessResourceBuilder({ ...this.definition, section });
  }

  action<const N extends string, C extends BusinessContribution>(
    name: N extends keyof A ? never : N,
    configure: (action: BusinessActionBuilder) => C,
  ): BusinessResourceBuilder<A & Record<N, ContributionScopes<C>>> {
    if (!name || this.definition.actions.some((action) => action.name === name))
      throw new TypeError(`Duplicate or empty business action: ${name}`);
    const built = configure(new BusinessActionBuilder()).build();
    const title =
      'title' in built && built.title !== undefined
        ? (built.title as AuthorizationTitle)
        : name;
    const action: BusinessAction = {
      name,
      title,
      grants: built.grants,
      ...(built.dataScopes?.length ? { dataScopes: built.dataScopes } : {}),
    };
    return new BusinessResourceBuilder({
      ...this.definition,
      actions: [...this.definition.actions, action],
    });
  }

  build(): BusinessResource {
    return validateBusinessResource(structuredClone(this.definition));
  }

  reference(): BusinessResourceReference<A> {
    return new BusinessResourceReference(this.build());
  }
}

/** Builds a business resource; `authz.business.define` registers it. */
export function defineBusinessResource<A extends BusinessActions>(
  name: string,
  configure: (resource: BusinessResourceBuilder) => BusinessResourceBuilder<A>,
): BusinessResourceBuilder<A> {
  if (!name) throw new TypeError('A business resource needs a name');
  const result = configure(
    new BusinessResourceBuilder({ name, title: name, actions: [] }),
  );
  return new BusinessResourceBuilder<A>(result.build());
}

function validateBusinessResource(
  definition: BusinessResource,
): BusinessResource {
  if (!definition.name) throw new TypeError('A business resource needs a name');
  const names = definition.actions.map((action) => action.name);
  if (
    !names.length ||
    names.some((name) => !name) ||
    new Set(names).size !== names.length
  )
    throw new TypeError(
      `Business resource ${definition.name} needs unique, nonempty actions`,
    );
  for (const action of definition.actions) validateBusinessAction(action);
  return definition;
}

function validateBusinessAction(action: BusinessAction): void {
  if (!action.grants.length)
    throw new TypeError(`Business action ${action.name} grants nothing`);
  for (const grant of action.grants)
    if (grant.resource.type !== COLLECTION_TYPE)
      throw new TypeError(
        `Business action ${action.name} may only compose ${COLLECTION_TYPE} grants, not ${grant.resource.type}`,
      );
  const scopes = action.dataScopes ?? [];
  const keys = scopes.map((scope) => scope.key);
  if (keys.some((key) => !key) || new Set(keys).size !== keys.length)
    throw new TypeError(`Business action ${action.name} repeats a data scope`);
  for (const scope of scopes) {
    const options = scope.options;
    if (
      !scope.collection ||
      (options !== undefined &&
        (!options.length || new Set(options).size !== options.length)) ||
      (scope.defaultValue !== undefined &&
        options !== undefined &&
        !options.includes(scope.defaultValue))
    )
      throw new TypeError(`Invalid data scope: ${action.name}.${scope.key}`);
    if (
      !action.grants.some(
        (grant) =>
          grant.resource.id === scope.collection &&
          grant.actions.some((entry) => entry.scopeKey === scope.key),
      )
    )
      throw new TypeError(
        `Data scope ${action.name}.${scope.key} is not used by a grant on ${scope.collection}`,
      );
  }
  for (const grant of action.grants)
    for (const entry of grant.actions) {
      if (entry.scopeKey === undefined) continue;
      const scope = scopes.find((item) => item.key === entry.scopeKey);
      if (!scope || scope.collection !== grant.resource.id)
        throw new TypeError(
          `Grant on ${grant.resource.id} names an unknown data scope: ${entry.scopeKey}`,
        );
    }
}

function normalizeScopeValue(value: DataScopeValue): RecordSelection {
  return typeof value === 'string'
    ? { type: 'recordAccess', key: value }
    : parseRecordSelection(value);
}

function validateScopeValue(
  action: BusinessAction,
  key: string,
  value: unknown,
): RecordSelection | undefined {
  const scope = action.dataScopes?.find((entry) => entry.key === key);
  if (!scope) throw new TypeError(`Unknown data scope: ${action.name}.${key}`);
  if (value === '') return undefined;
  if (typeof value !== 'string' && (typeof value !== 'object' || !value))
    throw new TypeError(`Invalid value for data scope ${action.name}.${key}`);
  const selection = normalizeScopeValue(value as DataScopeValue);
  if (
    selection.type === 'recordAccess' &&
    scope.options !== undefined &&
    !scope.options.includes(selection.key)
  )
    throw new TypeError(
      `Data scope ${action.name}.${key} does not offer ${selection.key}`,
    );
  return selection;
}

export interface BusinessApi {
  /** Registers a definition object or a `defineBusinessResource` result. */
  define<A extends BusinessActions = BusinessActions>(
    definition: BusinessResource | BusinessResourceBuilder<A>,
  ): BusinessResourceReference<A>;
  getAction(id: string, action: string): BusinessAction | undefined;
  list(): readonly BusinessResource[];
}

export class BusinessResourceRegistry implements BusinessApi {
  private readonly definitions = new Map<string, BusinessResource>();
  private host?: { items: ResourceItems };

  attach(items: ResourceItems): void {
    this.host = { items };
  }

  define<A extends BusinessActions = BusinessActions>(
    definition: BusinessResource | BusinessResourceBuilder<A>,
  ): BusinessResourceReference<A> {
    if (!this.host)
      throw new Error(
        'The business plugin is not installed in an Authorization',
      );
    const resource = validateBusinessResource(
      definition instanceof BusinessResourceBuilder
        ? definition.build()
        : structuredClone(definition),
    );
    if (this.definitions.has(resource.name))
      throw new Error(`Business resource already defined: ${resource.name}`);
    this.host.items.add({
      id: resource.name,
      title: resource.title,
      ...(resource.section === undefined ? {} : { section: resource.section }),
      actions: resource.actions.map(({ name, title }) => ({ name, title })),
    });
    this.definitions.set(resource.name, resource);
    return new BusinessResourceReference<A>(resource);
  }

  getAction(id: string, action: string): BusinessAction | undefined {
    const found = this.definitions
      .get(id)
      ?.actions.find((entry) => entry.name === action);
    return found && structuredClone(found);
  }

  list(): readonly BusinessResource[] {
    return structuredClone([...this.definitions.values()]);
  }

  get size(): number {
    return this.definitions.size;
  }

  /** A business grant followed by the collection grants it composes. */
  expand(grant: AuthorizationGrant): readonly AuthorizationGrant[] {
    if (grant.resource.type !== BUSINESS_RESOURCE_TYPE) return [grant];
    const action = this.definitions
      .get(grant.resource.id)
      ?.actions.find((entry) => entry.name === grant.action);
    if (!action)
      throw new TypeError(
        `Unknown business action: ${grant.resource.id}.${grant.action}`,
      );
    const scopes = businessScopes(grant.policy);
    const selections = new Map<string, RecordSelection | undefined>();
    for (const [key, value] of Object.entries(scopes))
      selections.set(key, validateScopeValue(action, key, value));
    for (const scope of action.dataScopes ?? [])
      if (!selections.has(scope.key) && scope.defaultValue !== undefined)
        selections.set(scope.key, normalizeScopeValue(scope.defaultValue));
    return [
      grant,
      ...action.grants.flatMap((target) =>
        target.actions.map((entry): AuthorizationGrant => {
          const selection =
            entry.scopeKey === undefined
              ? undefined
              : selections.get(entry.scopeKey);
          return {
            source: grant.source,
            resource: target.resource,
            action: entry.action,
            ...(entry.policy === undefined ? {} : { policy: entry.policy }),
            origin: {
              resource: grant.resource,
              action: grant.action,
              ...(entry.scopeKey === undefined
                ? {}
                : { scopeKey: entry.scopeKey }),
              ...(selection === undefined ? {} : { selection }),
            },
          };
        }),
      ),
    ];
  }
}

function businessScopes(
  policy: AuthorizationPolicy | undefined,
): Readonly<Record<string, unknown>> {
  if (policy === undefined) return {};
  const scopes: unknown = policy.scopes;
  if (
    policy.type !== 'business' ||
    typeof scopes !== 'object' ||
    scopes === null ||
    Array.isArray(scopes)
  )
    throw new TypeError('Invalid business grant policy');
  return scopes as Readonly<Record<string, unknown>>;
}

const registries = new WeakMap<AuthorizationPlugin, BusinessResourceRegistry>();

/** Package-internal: finds the installed business registry. */
export function businessRegistryOf(
  plugins: readonly AuthorizationPlugin[],
): BusinessResourceRegistry | undefined {
  for (const plugin of plugins) {
    const registry = registries.get(plugin);
    if (registry) return registry;
  }
  return undefined;
}

export interface BusinessAuthorizationApi {
  business: BusinessApi;
}

export type BusinessPlugin = AuthorizationPlugin<BusinessAuthorizationApi>;

/** Registers the `business` resource type and `authz.business`. */
export function businessPlugin(): BusinessPlugin {
  const registry = new BusinessResourceRegistry();
  const plugin: BusinessPlugin = {
    id: 'business',
    authorizationApi: { business: registry },
    setup(authz): void {
      const items = new ResourceItems();
      authz.resourceTypes.add({
        type: BUSINESS_RESOURCE_TYPE,
        items,
        title: { key: 'resourceTypes.business', ns: '@nocobase/authorization' },
        defaultSection: 'business',
        async authorize(request, context) {
          const grants = await context.grants.resolve({
            principal: request.principal,
            ...(request.subjects === undefined
              ? {}
              : { subjects: request.subjects }),
            resource: request.resource,
            action: request.action,
          });
          return grants.length
            ? {
                effect: 'permit',
                reasons: grants.map((grant) => ({
                  code: 'GRANT_MATCHED',
                  message: `${grant.source.plugin}:${grant.source.id} allows ${request.resource.id}.${request.action}`,
                  plugin: 'business',
                  details: { source: grant.source, policy: grant.policy },
                })),
              }
            : {
                effect: 'deny',
                reasons: [
                  {
                    code: 'NO_MATCHING_GRANT',
                    message: `No grant allows ${request.resource.id}.${request.action}`,
                    plugin: 'business',
                  },
                ],
              };
        },
      });
      registry.attach(items);
    },
  };
  registries.set(plugin, registry);
  return plugin;
}

/** Wraps a Grant Provider so business grants resolve with what they compose. */
export function composedGrants(
  provider: AuthorizationGrantService,
  registry: BusinessResourceRegistry | undefined,
  constraints: AccessConstraintService,
): AuthorizationGrantService {
  if (!registry) return provider;
  const expand = (
    grants: readonly AuthorizationGrant[],
    input: Parameters<AuthorizationGrantService['resolveAll']>[0],
  ): Promise<AuthorizationGrant[]> =>
    Promise.all(
      grants
        .flatMap((grant) => registry.expand(grant))
        .map(async (grant) => {
          if (grant.origin?.scopeKey === undefined) return grant;
          const branch = await constraints.resolve({
            ...input,
            resource: grant.origin.resource,
            action: grant.origin.action,
            scopeKey: grant.origin.scopeKey,
          });
          return { ...grant, origin: { ...grant.origin, constraints: branch } };
        }),
    );
  return {
    resolveAll: async (input) =>
      expand(await provider.resolveAll(input), input),
    resolve: async (input) => {
      const direct = await provider.resolve(input);
      if (input.resource.type === BUSINESS_RESOURCE_TYPE) {
        // Checking the feature alone still validates its stored policies.
        direct.forEach((grant) => registry.expand(grant));
        return direct;
      }
      if (!registry.size) return direct;
      const business = (await provider.resolveAll(input)).filter(
        (grant) => grant.resource.type === BUSINESS_RESOURCE_TYPE,
      );
      const composed = (await expand(business, input)).filter(
        (grant) =>
          grant.resource.type === input.resource.type &&
          (grant.resource.id === '*' ||
            grant.resource.id === input.resource.id) &&
          grant.action === input.action,
      );
      return [...direct, ...composed];
    },
    ...(provider.unrestricted
      ? { unrestricted: provider.unrestricted.bind(provider) }
      : {}),
    ...(provider.onChange
      ? { onChange: provider.onChange.bind(provider) }
      : {}),
    for: (identity) =>
      composedGrants(
        provider.for?.(identity) ?? provider,
        registry,
        constraints,
      ),
  };
}
