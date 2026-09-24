import {
  ReadPermissionBuilder,
  WritePermissionBuilder,
} from './permission-builders.js';
import type {
  AuthorizationContribution,
  ResourceTitle,
} from '@nocobase/authorization/core';
import type { PermissionGrant } from '@nocobase/authorization/permissions';
import type { DatabaseGrantDefinition, DatabaseActionGrant } from './model.js';

export type DatabaseOperation = 'read' | 'create' | 'update' | 'delete';
type Fields<Row> = '*' | readonly (keyof Row & string)[];
export interface RecordAccessReference<K extends string = string> {
  readonly key: K;
  readonly resources: readonly { type: string; id: string }[];
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

/** Reusable data permissions, independent of registration and action scope keys. */
export class DatabasePermissionBuilder<
  Row = Record<string, unknown>,
  O extends string = string,
> {
  declare readonly recordAccessSelection?:
    O | { readonly key: O; readonly params?: unknown };
  constructor(
    private readonly name: string,
    private readonly operations: DatabaseGrantDefinition = {},
    private readonly label: ResourceTitle | undefined = undefined,
    private readonly choices: {
      options?: readonly string[];
      defaultValue?: string;
    } = {},
  ) {
    if (!name) throw new TypeError('A collection name is required');
    this.operations = structuredClone(operations);
    this.label = structuredClone(label);
    this.choices = structuredClone(choices);
  }
  title(title: ResourceTitle): DatabasePermissionBuilder<Row, O> {
    return new DatabasePermissionBuilder(
      this.name,
      this.operations,
      title,
      this.choices,
    );
  }
  options<const R extends readonly RecordAccessReference[]>(
    ...options: R
  ): DatabasePermissionBuilder<Row, R[number]['key']> {
    if (
      !options.length ||
      options.some(
        (option) =>
          !option.resources.some(
            (resource) =>
              resource.type === 'database.collection' &&
              (resource.id === '*' || resource.id === this.name),
          ),
      )
    )
      throw new TypeError(
        'Record access policy does not apply to this collection',
      );
    const keys = options.map((option) => option.key);
    if (
      new Set(keys).size !== keys.length ||
      (this.choices.defaultValue && !keys.includes(this.choices.defaultValue))
    )
      throw new TypeError('Invalid record access options');
    return new DatabasePermissionBuilder(
      this.name,
      this.operations,
      this.label,
      { ...this.choices, options: keys },
    );
  }
  default(option: RecordAccessReference<O>): DatabasePermissionBuilder<Row, O> {
    if (
      !option.resources.some(
        (resource) =>
          resource.type === 'database.collection' &&
          (resource.id === '*' || resource.id === this.name),
      ) ||
      (this.choices.options && !this.choices.options.includes(option.key))
    )
      throw new TypeError('Invalid default record access policy');
    return new DatabasePermissionBuilder(
      this.name,
      this.operations,
      this.label,
      { ...this.choices, defaultValue: option.key },
    );
  }
  read(
    fields:
      | Fields<Row>
      | ((read: ReadPermissionBuilder<Row>) => ReadPermissionBuilder<Row>),
  ): DatabasePermissionBuilder<Row, O> {
    return this.operation(
      'read',
      typeof fields === 'function'
        ? fields(new ReadPermissionBuilder<Row>()).build()
        : { fields },
    );
  }
  create(
    fields:
      | Fields<Row>
      | ((
          write: WritePermissionBuilder<Row, true>,
        ) => WritePermissionBuilder<Row, true>),
  ): DatabasePermissionBuilder<Row, O> {
    return this.operation(
      'create',
      typeof fields === 'function'
        ? fields(new WritePermissionBuilder<Row, true>({}, true)).build()
        : { fields },
    );
  }
  update(
    fields:
      | Fields<Row>
      | ((
          write: WritePermissionBuilder<Row, false>,
        ) => WritePermissionBuilder<Row, false>),
  ): DatabasePermissionBuilder<Row, O> {
    return this.operation(
      'update',
      typeof fields === 'function'
        ? fields(new WritePermissionBuilder<Row, false>({}, false)).build()
        : { fields },
    );
  }
  delete(): DatabasePermissionBuilder<Row, O> {
    return this.operation('delete', {});
  }

  private operation(
    action: DatabaseOperation,
    policy: DatabaseActionGrant,
  ): DatabasePermissionBuilder<Row, O> {
    if (Object.hasOwn(this.operations, action))
      throw new TypeError(`Duplicate database action: ${action}`);
    return new DatabasePermissionBuilder(
      this.name,
      { ...this.operations, [action]: policy },
      this.label,
      this.choices,
    );
  }
  build(): PermissionGrant {
    if (!Object.keys(this.operations).length)
      throw new TypeError('A database permission needs at least one action');
    return structuredClone(databaseGrant(this.name, this.operations));
  }
  bind<const K extends string>(
    key: K,
    metadata?: { title?: ResourceTitle },
  ): AuthorizationContribution<
    Record<K, O | { readonly key: O; readonly params?: unknown }>
  > {
    if (!key || key === 'type')
      throw new TypeError('Invalid action permission key');
    const grant = this.build();
    const contribution = {
      grants: [
        {
          ...grant,
          actions: grant.actions.map((action) => ({
            ...action,
            policy: { ...action.policy, type: 'database', scope: key },
          })),
        },
      ],
      scopes: {
        [key]: {
          ...this.choices,
          title: metadata?.title ?? this.label ?? this.name,
          resource: grant.resource,
        },
      },
    };
    return { build: () => structuredClone(contribution) };
  }
}

export class DatabasePermissionDefinitionBuilder {
  collection<Row = Record<string, unknown>>(
    name: string,
  ): DatabasePermissionBuilder<Row> {
    return new DatabasePermissionBuilder<Row>(name);
  }
}

export function defineDatabasePermission<Row, O extends string>(
  configure: (
    permission: DatabasePermissionDefinitionBuilder,
  ) => DatabasePermissionBuilder<Row, O>,
): DatabasePermissionBuilder<Row, O> {
  const permission = configure(new DatabasePermissionDefinitionBuilder());
  permission.build();
  return permission;
}
