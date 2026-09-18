import type {
  AuthorizationContribution,
  ActionScopes,
  ResourceTitle,
} from '@nocobase/authorization/core';
import type { FilterLiteral, FilterNode } from '@nocobase/db';
import type { PermissionGrant } from '@nocobase/authorization/permissions';
import type { DatabaseCollectionRegistration } from './collection-registry.js';
import type { DatabaseApi } from './api.js';
import type { DatabaseGrantDefinition, DatabaseActionGrant } from './model.js';
import type {
  RecordAccessPolicy,
  RecordAccessPolicyContext,
} from './record-access.js';
import type { RecordAccessPolicyRegistry } from './record-access-registry.js';
import { condition, type DatabaseScope } from './scope.js';

export type DatabaseOperation = 'read' | 'create' | 'update' | 'delete';
type Fields<Row> = '*' | readonly (keyof Row & string)[];
export interface CollectionShape {
  name: string;
  fields: readonly { name: string }[];
}
export type CollectionRow<D extends CollectionShape> = Record<
  D['fields'][number]['name'],
  FilterLiteral
>;

export interface RecordAccessReference<
  C extends string = string,
  K extends string = string,
> {
  readonly key: K;
  readonly collections: readonly C[];
}
export interface TypedRecordFilter<Row> {
  eq<K extends keyof Row & string>(
    field: K,
    value: NoInfer<Row[K]> & FilterLiteral,
  ): FilterNode;
}

export class RecordAccessBuilder<Row, C extends string, K extends string> {
  constructor(
    private readonly registry: RecordAccessPolicyRegistry | undefined,
    private readonly definition: Omit<RecordAccessPolicy, 'resolve'> & {
      key: K;
      collections: readonly C[];
    },
  ) {}
  title(title: ResourceTitle): RecordAccessBuilder<Row, C, K> {
    return new RecordAccessBuilder(this.registry, {
      ...this.definition,
      title,
    });
  }
  resolve(
    resolver: (
      context: RecordAccessPolicyContext<unknown> & {
        filter: TypedRecordFilter<Row>;
      },
    ) => DatabaseScope | Promise<DatabaseScope>,
  ): {
    build(): RecordAccessPolicy;
    register(
      registry?: RecordAccessPolicyRegistry,
    ): RecordAccessReference<C, K>;
  } {
    const definition = structuredClone(this.definition);
    const build = (): RecordAccessPolicy => ({
      ...structuredClone(definition),
      resolve: (context) =>
        resolver({
          ...context,
          filter: { eq: (field, value) => condition(field, '$eq', value) },
        }),
    });
    return {
      build,
      register: (registry = this.registry) => {
        if (!registry) throw new Error('A record access registry is required');
        registry.add(build());
        return {
          key: definition.key,
          collections: [...definition.collections],
        };
      },
    };
  }
}

/** Immutable builder: reusing a scope cannot leak fields into another action. */
export class DatabaseScopeBuilder<
  Row,
  C extends string,
  A extends DatabaseOperation,
  S extends string,
  O extends string = string,
> implements AuthorizationContribution<
  Record<S, O | { readonly key: O; readonly params?: unknown }>
> {
  declare readonly scopeSelections?: Record<
    S,
    O | { readonly key: O; readonly params?: unknown }
  >;
  constructor(
    private readonly collection: C,
    private readonly allowedActions: readonly A[],
    private readonly key: S,
    private readonly metadata: {
      title: ResourceTitle;
      options?: readonly string[];
      defaultValue?: string;
    },
    private readonly operations: DatabaseGrantDefinition = {},
  ) {}
  options<const R extends readonly RecordAccessReference[]>(
    ...options: R & {
      [I in keyof R]: C extends R[I]['collections'][number] ? R[I] : never;
    }
  ): DatabaseScopeBuilder<Row, C, A, S, R[number]['key']> {
    if (options.some((option) => !option.collections.includes(this.collection)))
      throw new TypeError(
        'Record access policy does not apply to this collection',
      );
    return new DatabaseScopeBuilder(
      this.collection,
      this.allowedActions,
      this.key,
      { ...this.metadata, options: options.map((option) => option.key) },
      this.operations,
    );
  }
  default<const R extends RecordAccessReference<string, O>>(
    option: R & (C extends R['collections'][number] ? unknown : never),
  ): DatabaseScopeBuilder<Row, C, A, S, O> {
    if (
      !option.collections.includes(this.collection) ||
      (this.metadata.options && !this.metadata.options.includes(option.key))
    )
      throw new TypeError('Invalid default record access policy');
    return new DatabaseScopeBuilder(
      this.collection,
      this.allowedActions,
      this.key,
      { ...this.metadata, defaultValue: option.key },
      this.operations,
    );
  }
  read(
    this: 'read' extends A ? DatabaseScopeBuilder<Row, C, A, S, O> : never,
    fields: Fields<Row>,
  ): DatabaseScopeBuilder<Row, C, A, S, O> {
    return this.operation('read', { fields: { output: fields } });
  }
  create(
    this: 'create' extends A ? DatabaseScopeBuilder<Row, C, A, S, O> : never,
    fields: Fields<Row>,
  ): DatabaseScopeBuilder<Row, C, A, S, O> {
    return this.operation('create', { fields: { input: fields } });
  }
  update(
    this: 'update' extends A ? DatabaseScopeBuilder<Row, C, A, S, O> : never,
    fields: Fields<Row>,
  ): DatabaseScopeBuilder<Row, C, A, S, O> {
    return this.operation('update', { fields: { input: fields } });
  }
  delete(
    this: 'delete' extends A ? DatabaseScopeBuilder<Row, C, A, S, O> : never,
  ): DatabaseScopeBuilder<Row, C, A, S, O> {
    return this.operation('delete', {});
  }
  private operation(
    action: DatabaseOperation,
    policy: DatabaseActionGrant,
  ): DatabaseScopeBuilder<Row, C, A, S, O> {
    if (!(this.allowedActions as readonly string[]).includes(action))
      throw new TypeError(`Undeclared database action: ${action}`);
    if (Object.hasOwn(this.operations, action))
      throw new TypeError(`Duplicate database action: ${action}`);
    return new DatabaseScopeBuilder(
      this.collection,
      this.allowedActions,
      this.key,
      this.metadata,
      {
        ...this.operations,
        [action]: { ...structuredClone(policy), scope: this.key },
      },
    );
  }
  build(): { grants: readonly PermissionGrant[]; scopes: ActionScopes } {
    if (!Object.keys(this.operations).length)
      throw new TypeError('A database scope needs at least one action');
    return structuredClone({
      grants: [databaseGrant(this.collection, this.operations)],
      scopes: {
        [this.key]: {
          ...this.metadata,
          resource: { type: 'database.collection', id: this.collection },
        },
      },
    });
  }
}

export class DatabaseCollectionReference<
  Row,
  C extends string,
  A extends DatabaseOperation,
> {
  constructor(
    private readonly api: DatabaseApi | undefined,
    readonly name: C,
    private readonly actions: readonly A[],
  ) {}
  scope<const S extends string>(
    key: S,
    metadata: { title: ResourceTitle },
  ): DatabaseScopeBuilder<Row, C, A, S> {
    return new DatabaseScopeBuilder(this.name, this.actions, key, metadata);
  }
  recordAccess<const K extends string>(key: K): RecordAccessBuilder<Row, C, K> {
    return new RecordAccessBuilder(this.api?.recordAccess, {
      key,
      collections: [this.name],
    });
  }
}

export class DatabaseCollectionBuilder<
  Row,
  C extends string,
  A extends DatabaseOperation = DatabaseOperation,
> {
  constructor(
    private readonly api: DatabaseApi | undefined,
    private readonly name: C,
    private readonly metadata: { title?: ResourceTitle; actions: readonly A[] },
  ) {}
  /** Reuse a model's row type when the schema is registered dynamically. */
  typed<T extends object>(): DatabaseCollectionBuilder<T, C, A> {
    return new DatabaseCollectionBuilder(this.api, this.name, this.metadata);
  }
  title(title: ResourceTitle): DatabaseCollectionBuilder<Row, C, A> {
    return new DatabaseCollectionBuilder(this.api, this.name, {
      ...this.metadata,
      title,
    });
  }
  actions<const T extends readonly DatabaseOperation[]>(
    ...actions: T
  ): DatabaseCollectionBuilder<Row, C, T[number]> {
    return new DatabaseCollectionBuilder(this.api, this.name, {
      ...this.metadata,
      actions,
    });
  }
  build(): DatabaseCollectionRegistration {
    return structuredClone({ name: this.name, ...this.metadata });
  }
  reference(
    api: DatabaseApi | undefined = this.api,
  ): DatabaseCollectionReference<Row, C, A> {
    return new DatabaseCollectionReference(
      api,
      this.name,
      this.metadata.actions,
    );
  }
  register(
    api: DatabaseApi | undefined = this.api,
  ): DatabaseCollectionReference<Row, C, A> {
    if (!api) throw new Error('A database authorization API is required');
    api.collections.add(this.build());
    return this.reference(api);
  }
}

export function databaseCollection<const D extends CollectionShape>(
  definition: D,
): DatabaseCollectionBuilder<CollectionRow<D>, D['name']>;
export function databaseCollection<const N extends string>(
  name: N,
): DatabaseCollectionBuilder<Record<string, FilterLiteral>, N>;
export function databaseCollection(
  definition: string | CollectionShape,
): DatabaseCollectionBuilder<Record<string, FilterLiteral>, string> {
  return new DatabaseCollectionBuilder(
    undefined,
    typeof definition === 'string' ? definition : definition.name,
    { actions: ['read', 'create', 'update', 'delete'] },
  );
}
export function databaseGrant(
  resource: string,
  definition: DatabaseGrantDefinition,
): PermissionGrant {
  return {
    resource: { type: 'database.collection', id: resource },
    actions: Object.entries(definition).map(([action, config]) => ({
      action,
      policy: { type: 'database', ...config },
    })),
  };
}
export function databaseScope(
  recordAccess: import('./model.js').DatabaseRecordAccess,
): import('./model.js').DatabaseAccessScope {
  return { type: 'database', recordAccess };
}
