import {
  ReadPermissionBuilder,
  WritePermissionBuilder,
} from './permission-builders.js';
import type {
  AuthorizationTitle,
  BindableCompositePermission,
  CompositeContribution,
  DataScope,
  PermissionGrant,
  RecordAccessReference,
  RecordSelection,
} from '@nocobase/authorization/core';
import type { DatabaseGrantDefinition, DatabaseActionGrant } from './model.js';

export type DatabaseOperation = 'read' | 'create' | 'update' | 'delete';
type Fields<Row> = '*' | readonly (keyof Row & string)[];

interface DataScopeChoices {
  options?: readonly string[];
  defaultValue?: string;
}

/** The permission-set grant of one collection. */
export function databaseGrant(
  collection: string,
  definition: DatabaseGrantDefinition,
): PermissionGrant {
  return {
    resource: { type: 'database.collection', id: collection },
    actions: Object.entries(definition).map(([action, config]) => ({
      action,
      policy: { type: 'database', ...config },
    })),
  };
}

function applies(
  reference: RecordAccessReference,
  collection: string,
): boolean {
  return reference.collections.some(
    (name) => name === '*' || name === collection,
  );
}

/**
 * A collection's fields and relations per operation. Binding it to a key makes
 * it a data scope of a composite action.
 */
export class DatabasePermissionBuilder<
  Row = Record<string, unknown>,
  O extends string = string,
> implements BindableCompositePermission {
  declare readonly recordAccessSelection?: O | '' | RecordSelection;
  private readonly operations: DatabaseGrantDefinition;
  private readonly label: AuthorizationTitle | undefined;
  private readonly choices: DataScopeChoices;

  constructor(
    private readonly name: string,
    operations: DatabaseGrantDefinition = {},
    label: AuthorizationTitle | undefined = undefined,
    choices: DataScopeChoices = {},
  ) {
    if (!name) throw new TypeError('A collection name is required');
    this.operations = structuredClone(operations);
    this.label = structuredClone(label);
    this.choices = structuredClone(choices);
  }

  title(title: AuthorizationTitle): DatabasePermissionBuilder<Row, O> {
    return new DatabasePermissionBuilder(
      this.name,
      this.operations,
      title,
      this.choices,
    );
  }

  /** The record access a grant may choose for the bound data scope. */
  options<const R extends readonly RecordAccessReference[]>(
    ...options: R
  ): DatabasePermissionBuilder<Row, R[number]['key']> {
    if (
      !options.length ||
      options.some((option) => !applies(option, this.name))
    )
      throw new TypeError(`Record access does not apply to ${this.name}`);
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
      {
        ...this.choices,
        options: keys,
      },
    );
  }

  /** The record access used when a grant chooses nothing. */
  default(option: RecordAccessReference<O>): DatabasePermissionBuilder<Row, O> {
    if (
      !applies(option, this.name) ||
      (this.choices.options && !this.choices.options.includes(option.key))
    )
      throw new TypeError('Invalid default record access');
    return new DatabasePermissionBuilder(
      this.name,
      this.operations,
      this.label,
      {
        ...this.choices,
        defaultValue: option.key,
      },
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

  /** The collection grant a Permission Set stores. */
  build(): PermissionGrant {
    if (!Object.keys(this.operations).length)
      throw new TypeError('A database permission needs at least one action');
    return structuredClone(databaseGrant(this.name, this.operations));
  }

  bind<const K extends string>(
    key: K,
    metadata?: { title?: AuthorizationTitle },
  ): CompositeContribution<Record<K, O | '' | RecordSelection>> {
    if (!key) throw new TypeError('A data scope needs a key');
    const grant = this.build();
    const scope: DataScope = {
      key,
      title: metadata?.title ?? this.label ?? this.name,
      ...this.choices,
    };
    const contribution = {
      grants: [
        {
          resource: grant.resource,
          actions: grant.actions.map((action) => ({
            ...action,
            scopeKey: key,
          })),
        },
      ],
      dataScopes: [scope],
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
