import type { AccessConstraintService } from './constraints.js';
import type {
  AuthorizationGrant,
  AuthorizationGrantSource,
  AuthorizationGrantService,
  AuthorizationPolicy,
  PermissionGrant,
  PermissionGrantAction,
} from './grants.js';
import {
  ResourceItems,
  addReservedResourceType,
  type AuthorizationRuntimeContext,
  type ResourceTypeRegistry,
} from './resource-types.js';
import { parseRecordSelection, type RecordSelection } from './selection.js';
import type { AuthorizationTitle } from './titles.js';
import type {
  AuthorizationConditions,
  AuthorizationDecision,
  AuthorizationRequest,
  ResourceRef,
} from './types.js';

/** Package-internal: the reserved type every composite is stored under. */
export const COMPOSITE_RESOURCE_TYPE = 'composite';

/**
 * A named slot on a composite action that a grant or rule fills with records.
 * Its target is the one resource the grant actions naming it address; see
 * `dataScopeTarget`.
 */
export interface DataScope {
  readonly key: string;
  readonly title: AuthorizationTitle;
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

export interface CompositeGrantAction extends PermissionGrantAction {
  /** The data scope this action's records are chosen by. */
  scopeKey?: string;
}

export interface CompositeGrant {
  resource: ResourceRef;
  actions: readonly CompositeGrantAction[];
}

export interface CompositeAction {
  name: string;
  title: AuthorizationTitle;
  dataScopes?: readonly DataScope[];
  grants: readonly CompositeGrant[];
}

/**
 * A resource whose actions expand into a set of underlying grants, each
 * optionally bound to a named data scope.
 */
export interface Composite {
  name: string;
  title: AuthorizationTitle;
  actions: readonly CompositeAction[];
}

/** The policy of a composite grant: one value per data scope it sets. */
export interface CompositePolicy extends AuthorizationPolicy {
  type: 'composite';
  scopes: Readonly<Record<string, DataScopeValue>>;
}

/** One underlying check of a composite action, made with that action's grants. */
export interface CompositeCheck {
  resource: ResourceRef;
  action: string;
  decision: AuthorizationDecision;
}

/** Plugins extend this through `composeConditions`. */
export interface CompositeConditions extends AuthorizationConditions {
  type: 'composite';
  checks: readonly CompositeCheck[];
}

export interface CompositeContributionData {
  grants: readonly CompositeGrant[];
  dataScopes?: readonly DataScope[];
}

/** What a composite action is built from; `S` carries data scope value types. */
export interface CompositeContribution<
  S extends Record<string, DataScopeValue> = Record<never, never>,
> {
  build(): CompositeContributionData;
  /** Type-only: the values each data scope of this contribution accepts. */
  readonly scopeSelections?: S;
}

/** A plugin-owned permission that becomes a data scope once bound to a key. */
export interface BindableCompositePermission {
  /** Type-only: the values the bound data scope accepts. */
  readonly recordAccessSelection?: DataScopeValue;
  bind<K extends string>(
    key: K,
    metadata?: { title?: AuthorizationTitle },
  ): CompositeContribution<Record<K, DataScopeValue>>;
}

type ContributionScopes<C extends CompositeContribution> =
  'scopeSelections' extends keyof C
    ? NonNullable<C['scopeSelections']>
    : Record<never, never>;

export interface CompositeActionData {
  title?: AuthorizationTitle;
  grants: readonly CompositeGrant[];
  dataScopes: readonly DataScope[];
}

export class CompositeActionBuilder<
  S extends Record<string, DataScopeValue> = Record<never, never>,
> implements CompositeContribution<S> {
  declare readonly scopeSelections?: S;
  private readonly data: CompositeActionData;

  constructor(data: CompositeActionData = { grants: [], dataScopes: [] }) {
    this.data = structuredClone(data);
  }

  title(title: AuthorizationTitle): CompositeActionBuilder<S> {
    return new CompositeActionBuilder({ ...this.data, title });
  }

  grant<C extends CompositeContribution>(
    contribution: C,
  ): CompositeActionBuilder<S & ContributionScopes<C>>;
  grant<const K extends string, P extends BindableCompositePermission>(
    key: K extends keyof S ? never : K,
    permission: P,
    metadata?: { title?: AuthorizationTitle },
  ): CompositeActionBuilder<
    S &
      Record<
        K,
        'recordAccessSelection' extends keyof P
          ? NonNullable<P['recordAccessSelection']>
          : DataScopeValue
      >
  >;
  grant(
    valueOrKey: CompositeContribution | string,
    permission?: BindableCompositePermission,
    metadata?: { title?: AuthorizationTitle },
  ): CompositeActionBuilder<S> {
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
    return new CompositeActionBuilder({
      ...this.data,
      grants: [...this.data.grants, ...built.grants],
      dataScopes,
    });
  }

  build(): CompositeActionData {
    return structuredClone(this.data);
  }
}

/** Data scope values per action, as the reference types them. */
export type CompositeActions = Record<string, Record<string, DataScopeValue>>;

type ScopeAssignments<S> = keyof S extends never
  ? Record<string, never>
  : Partial<S>;

export type CompositeActionAssignments<A extends CompositeActions> = {
  [K in keyof A]?: ScopeAssignments<A[K]>;
};

export interface CompositeScopeTarget<N extends string, K extends string> {
  action: N;
  scopeKey: K;
}

/** Type-safe grants and rule targets for one composite. */
export class CompositeReference<A extends CompositeActions> {
  private readonly definition: Composite;

  constructor(definition: Composite) {
    this.definition = structuredClone(definition);
  }

  get name(): string {
    return this.definition.name;
  }

  scope<N extends keyof A & string, K extends keyof A[N] & string>(
    action: N,
    key: K,
  ): CompositeScopeTarget<N, K> {
    if (
      !this.definition.actions
        .find((entry) => entry.name === action)
        ?.dataScopes?.some((scope) => scope.key === key)
    )
      throw new TypeError(`Unknown composite data scope: ${action}.${key}`);
    return { action, scopeKey: key };
  }

  grant(
    action: keyof A & string,
    ...actions: (keyof A & string)[]
  ): PermissionGrant;
  grant(actions: CompositeActionAssignments<A>): PermissionGrant;
  grant(...input: (string | CompositeActionAssignments<A>)[]): PermissionGrant {
    const first = input[0];
    const entries: [string, Readonly<Record<string, DataScopeValue>>][] =
      typeof first === 'object'
        ? Object.entries(first).map(([action, scopes]) => [
            action,
            (scopes ?? {}) as Readonly<Record<string, DataScopeValue>>,
          ])
        : (input as string[]).map((action) => [action, {}]);
    return compositeGrant(this.definition, entries);
  }
}

function compositeGrant(
  definition: Composite,
  entries: readonly [string, Readonly<Record<string, DataScopeValue>>][],
): PermissionGrant {
  const actions = entries.map(([name, scopes]): PermissionGrantAction => {
    const action = definition.actions.find((entry) => entry.name === name);
    if (!action)
      throw new TypeError(
        `Unknown composite action: ${definition.name}.${name}`,
      );
    for (const [key, value] of Object.entries(scopes))
      validateScopeValue(action, key, value);
    return Object.keys(scopes).length
      ? {
          action: name,
          policy: { type: 'composite', scopes: structuredClone(scopes) },
        }
      : { action: name };
  });
  return {
    resource: { type: COMPOSITE_RESOURCE_TYPE, id: definition.name },
    actions,
  };
}

export class CompositeBuilder<
  A extends CompositeActions = Record<never, never>,
> {
  private readonly definition: Composite;

  constructor(definition: Composite) {
    this.definition = structuredClone(definition);
  }

  title(title: AuthorizationTitle): CompositeBuilder<A> {
    return new CompositeBuilder({ ...this.definition, title });
  }

  action<const N extends string, C extends CompositeContribution>(
    name: N extends keyof A ? never : N,
    configure: (action: CompositeActionBuilder) => C,
  ): CompositeBuilder<A & Record<N, ContributionScopes<C>>> {
    if (!name || this.definition.actions.some((action) => action.name === name))
      throw new TypeError(`Duplicate or empty composite action: ${name}`);
    const built = configure(new CompositeActionBuilder()).build();
    const title =
      'title' in built && built.title !== undefined
        ? (built.title as AuthorizationTitle)
        : name;
    const action: CompositeAction = {
      name,
      title,
      grants: built.grants,
      ...(built.dataScopes?.length ? { dataScopes: built.dataScopes } : {}),
    };
    return new CompositeBuilder({
      ...this.definition,
      actions: [...this.definition.actions, action],
    });
  }

  build(): Composite {
    return validateComposite(structuredClone(this.definition));
  }

  reference(): CompositeReference<A> {
    return new CompositeReference(this.build());
  }
}

/** Builds a composite; `authz.composites.define` registers it. */
export function defineComposite<A extends CompositeActions>(
  name: string,
  configure: (resource: CompositeBuilder) => CompositeBuilder<A>,
): CompositeBuilder<A> {
  if (!name) throw new TypeError('A composite needs a name');
  const result = configure(
    new CompositeBuilder({ name, title: name, actions: [] }),
  );
  return new CompositeBuilder<A>(result.build());
}

function validateComposite(definition: Composite): Composite {
  if (!definition.name) throw new TypeError('A composite needs a name');
  const names = definition.actions.map((action) => action.name);
  if (
    !names.length ||
    names.some((name) => !name) ||
    new Set(names).size !== names.length
  )
    throw new TypeError(
      `Composite resource ${definition.name} needs unique, nonempty actions`,
    );
  for (const action of definition.actions) validateCompositeAction(action);
  return definition;
}

function validateCompositeAction(action: CompositeAction): void {
  if (!action.grants.length)
    throw new TypeError(`Composite action ${action.name} grants nothing`);
  for (const grant of action.grants)
    if (grant.resource.type === COMPOSITE_RESOURCE_TYPE)
      throw new TypeError(
        `Composite action ${action.name} cannot compose another composite: ${grant.resource.id}`,
      );
  const scopes = action.dataScopes ?? [];
  const keys = scopes.map((scope) => scope.key);
  if (keys.some((key) => !key) || new Set(keys).size !== keys.length)
    throw new TypeError(`Composite action ${action.name} repeats a data scope`);
  for (const scope of scopes) {
    const options = scope.options;
    if (
      (options !== undefined &&
        (!options.length || new Set(options).size !== options.length)) ||
      (scope.defaultValue !== undefined &&
        options !== undefined &&
        !options.includes(scope.defaultValue))
    )
      throw new TypeError(`Invalid data scope: ${action.name}.${scope.key}`);
    dataScopeTarget(action, scope.key);
  }
  for (const grant of action.grants)
    for (const entry of grant.actions)
      if (
        entry.scopeKey !== undefined &&
        !scopes.some((item) => item.key === entry.scopeKey)
      )
        throw new TypeError(
          `Grant on ${grant.resource.type}:${grant.resource.id} names an unknown data scope: ${entry.scopeKey}`,
        );
}

/**
 * The one resource a data scope of `action` selects records of: every grant
 * action naming the scope must address it. Throws when none does or when
 * they address different resources.
 */
export function dataScopeTarget(
  action: Pick<CompositeAction, 'name' | 'grants'>,
  key: string,
): ResourceRef {
  let target: ResourceRef | undefined;
  for (const grant of action.grants) {
    if (!grant.actions.some((entry) => entry.scopeKey === key)) continue;
    if (
      target &&
      (target.type !== grant.resource.type || target.id !== grant.resource.id)
    )
      throw new TypeError(
        `Data scope ${action.name}.${key} targets more than one resource: ${target.type}:${target.id} and ${grant.resource.type}:${grant.resource.id}`,
      );
    target = { type: grant.resource.type, id: grant.resource.id };
  }
  if (!target)
    throw new TypeError(
      `Data scope ${action.name}.${key} is not used by a grant`,
    );
  return target;
}

function normalizeScopeValue(value: DataScopeValue): RecordSelection {
  return typeof value === 'string'
    ? { type: 'recordAccess', key: value }
    : parseRecordSelection(value);
}

function validateScopeValue(
  action: CompositeAction,
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

export interface CompositeApi {
  /** Registers a definition object or a `defineComposite` result. */
  define<A extends CompositeActions = CompositeActions>(
    definition: Composite | CompositeBuilder<A>,
  ): CompositeReference<A>;
  getAction(id: string, action: string): CompositeAction | undefined;
  list(): readonly Composite[];
  /**
   * The data scopes whose target type is unregistered or lacks
   * `recordAccess`, one message each. `define` rejects these when the type is
   * already registered; a type registered later is checked here and on first
   * use.
   */
  validate(): readonly string[];
  /**
   * Why a stored composite grant cannot be expanded against the current
   * definitions — an unknown action, an unknown or invalid data scope, or a
   * malformed policy — or `undefined` when it is valid.
   */
  validateGrant(grant: CompositeGrantInput): string | undefined;
}

/** A composite grant as a Permission Set stores it: one action and its policy. */
export interface CompositeGrantInput {
  readonly resource: ResourceRef;
  readonly action: string;
  readonly policy?: AuthorizationPolicy;
}

/** A stored grant that was skipped because it no longer expands. */
export interface InvalidGrant {
  readonly source: AuthorizationGrantSource;
  readonly resource: ResourceRef;
  readonly action: string;
  readonly reason: string;
}

/**
 * Package-internal: `authz.composites`. It registers the reserved `composite`
 * resource type itself, so it is always available.
 */
export class CompositeRegistry implements CompositeApi {
  private readonly definitions = new Map<string, Composite>();
  /** Composites whose data scope targets have passed the `recordAccess` check. */
  private readonly verified = new Set<string>();
  private readonly items: ResourceItems = new ResourceItems();

  private readonly reported = new Set<string>();

  constructor(
    private readonly resourceTypes: ResourceTypeRegistry,
    private readonly onInvalidGrant?: (grant: InvalidGrant) => void,
  ) {
    addReservedResourceType(resourceTypes, {
      type: COMPOSITE_RESOURCE_TYPE,
      items: this.items,
      authorize: (request, context) =>
        authorizeComposite(this, request, context),
    });
  }

  define<A extends CompositeActions = CompositeActions>(
    definition: Composite | CompositeBuilder<A>,
  ): CompositeReference<A> {
    const resource = validateComposite(
      definition instanceof CompositeBuilder
        ? definition.build()
        : structuredClone(definition),
    );
    if (this.definitions.has(resource.name))
      throw new Error(`Composite already defined: ${resource.name}`);
    const problems = this.scopeProblems(resource, false);
    if (problems.length) throw new TypeError(problems[0]);
    this.items.add({
      id: resource.name,
      title: resource.title,
      actions: resource.actions.map(({ name, title }) => ({ name, title })),
    });
    this.definitions.set(resource.name, resource);
    return new CompositeReference<A>(resource);
  }

  validate(): readonly string[] {
    return [...this.definitions.values()].flatMap((resource) =>
      this.scopeProblems(resource, true),
    );
  }

  /**
   * Data scopes whose target type lacks `recordAccess`; with `strict`, also
   * those whose type is not registered yet.
   */
  private scopeProblems(resource: Composite, strict: boolean): string[] {
    const types = this.resourceTypes;
    return resource.actions.flatMap((action) =>
      (action.dataScopes ?? []).flatMap((scope) => {
        const target = dataScopeTarget(action, scope.key);
        const label = `Data scope ${resource.name}.${action.name}.${scope.key}`;
        if (!types.has(target.type))
          return strict
            ? [`${label} targets unregistered resource type ${target.type}`]
            : [];
        return types.get(target.type).recordAccess
          ? []
          : [
              `${label} targets resource type ${target.type}, which does not declare recordAccess`,
            ];
      }),
    );
  }

  /** Throws on first use when a data scope's target type is still unfit. */
  private verify(resource: Composite): void {
    if (this.verified.has(resource.name)) return;
    const problems = this.scopeProblems(resource, true);
    if (problems.length) throw new TypeError(problems[0]);
    this.verified.add(resource.name);
  }

  getAction(id: string, action: string): CompositeAction | undefined {
    const found = this.definitions
      .get(id)
      ?.actions.find((entry) => entry.name === action);
    return found && structuredClone(found);
  }

  list(): readonly Composite[] {
    return structuredClone([...this.definitions.values()]);
  }

  get size(): number {
    return this.definitions.size;
  }

  validateGrant(grant: CompositeGrantInput): string | undefined {
    if (grant.resource.type !== COMPOSITE_RESOURCE_TYPE) return undefined;
    try {
      this.expand({ ...grant, source: { plugin: '', id: '' } });
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * `expand`, with a grant that no longer expands skipped and reported rather
   * than failing every check of the identity that holds it.
   */
  expandOrSkip(grant: AuthorizationGrant): readonly AuthorizationGrant[] {
    const reason = this.validateGrant(grant);
    if (reason === undefined) return this.expand(grant);
    this.report(grant, reason);
    return [];
  }

  /** Tells `onInvalidGrant` once per distinct grant and reason. */
  report(grant: AuthorizationGrant, reason: string): void {
    const key = JSON.stringify([
      grant.source.plugin,
      grant.source.id,
      grant.resource,
      grant.action,
      reason,
    ]);
    if (this.reported.has(key)) return;
    this.reported.add(key);
    this.onInvalidGrant?.({
      source: grant.source,
      resource: grant.resource,
      action: grant.action,
      reason,
    });
  }

  /** A composite grant followed by the grants it composes. */
  expand(grant: AuthorizationGrant): readonly AuthorizationGrant[] {
    if (grant.resource.type !== COMPOSITE_RESOURCE_TYPE) return [grant];
    const resource = this.definitions.get(grant.resource.id);
    const action = resource?.actions.find(
      (entry) => entry.name === grant.action,
    );
    if (!resource || !action)
      throw new TypeError(
        `Unknown composite action: ${grant.resource.id}.${grant.action}`,
      );
    this.verify(resource);
    const scopes = compositeScopes(grant.policy);
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

function compositeScopes(
  policy: AuthorizationPolicy | undefined,
): Readonly<Record<string, unknown>> {
  if (policy === undefined) return {};
  const scopes: unknown = policy.scopes;
  if (
    policy.type !== COMPOSITE_RESOURCE_TYPE ||
    typeof scopes !== 'object' ||
    scopes === null ||
    Array.isArray(scopes)
  )
    throw new TypeError('Invalid composite grant policy');
  return scopes as Readonly<Record<string, unknown>>;
}

/**
 * A composite action is permitted by any valid grant on it; its branches are
 * checked separately. A stored grant that no longer expands permits nothing.
 */
async function authorizeComposite(
  registry: CompositeRegistry,
  request: AuthorizationRequest<unknown>,
  context: AuthorizationRuntimeContext,
): Promise<AuthorizationDecision> {
  const grants = await context.grants.resolve({
    principal: request.principal,
    ...(request.subjects === undefined ? {} : { subjects: request.subjects }),
    resource: request.resource,
    action: request.action,
  });
  const invalid = new Map<AuthorizationGrant, string>();
  for (const grant of grants) {
    const reason = registry.validateGrant(grant);
    if (reason !== undefined) invalid.set(grant, reason);
  }
  const valid = grants.filter((grant) => !invalid.has(grant));
  if (valid.length)
    return {
      effect: 'permit',
      reasons: valid.map((grant) => ({
        code: 'GRANT_MATCHED',
        message: `${grant.source.plugin}:${grant.source.id} allows ${request.resource.id}.${request.action}`,
        details: { source: grant.source, policy: grant.policy },
      })),
    };
  if (invalid.size)
    return {
      effect: 'deny',
      reasons: [...invalid].map(([grant, reason]) => ({
        code: 'INVALID_GRANT',
        message: `${grant.source.plugin}:${grant.source.id} grants ${request.resource.id}.${request.action} with a grant that no longer applies: ${reason}`,
        details: { source: grant.source, policy: grant.policy, reason },
      })),
    };
  return {
    effect: 'deny',
    reasons: [
      {
        code: 'NO_MATCHING_GRANT',
        message: `No grant allows ${request.resource.id}.${request.action}`,
      },
    ],
  };
}

/** Wraps a Grant Provider so composite grants resolve with what they compose. */
export function composedGrants(
  provider: AuthorizationGrantService,
  registry: CompositeRegistry,
  constraints: AccessConstraintService,
): AuthorizationGrantService {
  const expand = (
    grants: readonly AuthorizationGrant[],
    input: Parameters<AuthorizationGrantService['resolveAll']>[0],
  ): Promise<AuthorizationGrant[]> =>
    Promise.all(
      grants
        .flatMap((grant) => registry.expandOrSkip(grant))
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
      if (input.resource.type === COMPOSITE_RESOURCE_TYPE) {
        // The composite handler denies a grant that no longer expands.
        for (const grant of direct) {
          const reason = registry.validateGrant(grant);
          if (reason !== undefined) registry.report(grant, reason);
        }
        return direct;
      }
      if (!registry.size) return direct;
      const composites = (await provider.resolveAll(input)).filter(
        (grant) => grant.resource.type === COMPOSITE_RESOURCE_TYPE,
      );
      const composed = (await expand(composites, input)).filter(
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
