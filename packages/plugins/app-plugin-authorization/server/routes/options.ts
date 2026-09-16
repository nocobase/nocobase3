import type { ResourceGroup } from '@nocobase/authorization/core';
import type { DatabaseConnection } from '@nocobase/db';
import type { Context } from 'hono';
import { describeCollection } from '../database/index.js';
import {
  resolveOptionText,
  translateAuthorization,
  type OptionText,
} from '../i18n.js';
import type { AppAuthorizationService } from '../tokens.js';

/** One grantable Collection: its registration, plus the fields db reports. */
interface DatabaseCollectionOption {
  group?: string;
  readonly name: string;
  readonly title?: OptionText;
  readonly description?: OptionText;
  readonly fields: readonly string[];
}

/** One option as the wire carries it: a value and the text for this request's locale. */
interface Option {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

const crudActions = ['read', 'create', 'update', 'delete'] as const;
export async function permissionSetOptions(
  authz: AppAuthorizationService,
  connection: DatabaseConnection | undefined,
  context: Context,
): Promise<object> {
  const collections = await databaseCollections(authz, connection);
  const access = [actionOption(context, 'access')];
  return {
    plugins: ['permission-sets', 'pages', 'database'],
    resourceTypes: [
      {
        value: 'page',
        groups: authz.resources.get('page')
          ? resourceGroupOptions(
              context,
              authz.getResource('page').groups.list(),
            )
          : [],
        label: translateAuthorization(
          context,
          'options.resourceTypes.page',
          'Pages',
        ),
        resources: [
          ...(authz.resources.get('page')
            ? authz
                .getResource('page')
                .items.list()
                .map((item) => ({
                  value: item.id,
                  label: resolveOptionText(context, item.title, item.id),
                  ...(item.group ? { group: item.group } : {}),
                  actions: item.actions.map((action) =>
                    actionOption(context, action),
                  ),
                }))
            : []),
        ],
        actions: access,
      },
      databaseResourceOptions(context, collections, authz),
      administrationOptions(context, authz),
    ],
    subjectTypes: subjectTypeOptions(context, authz),
    ...databaseOptions(context, authz, collections),
  };
}

export async function databaseScopeRuleOptions(
  authz: AppAuthorizationService,
  connection: DatabaseConnection | undefined,
  context: Context,
): Promise<object> {
  const collections = await databaseCollections(authz, connection);
  const collection = databaseResourceOptions(context, collections, authz);
  const withoutCreate = (actions: readonly Option[]): readonly Option[] =>
    actions.filter((action) => action.value !== 'create');
  return {
    plugins: ['database'],
    resourceTypes: [
      {
        ...collection,
        resources: collection.resources.map((resource) => ({
          ...resource,
          actions: withoutCreate(resource.actions),
        })),
        actions: withoutCreate(collection.actions),
      },
    ],
    subjectTypes: subjectTypeOptions(context, authz),
    ...databaseOptions(context, authz, collections),
  };
}

function resourceGroupOptions(
  context: Context,
  groups: readonly ResourceGroup[],
): object[] {
  return groups.map((group) => ({
    value: group.id,
    label: resolveOptionText(context, group.title, group.id),
    ...(group.children
      ? { children: resourceGroupOptions(context, group.children) }
      : {}),
  }));
}

function administrationOptions(
  context: Context,
  authz: AppAuthorizationService,
): object {
  const settings = authz.getResource('settings');
  const resources = settings.items.list();
  return {
    value: 'settings',
    label: translateAuthorization(
      context,
      'options.resourceTypes.settings',
      'Admin settings',
    ),
    groups: resourceGroupOptions(context, settings.groups.list()),
    resources: resources.map((resource) => ({
      value: resource.id,
      ...(resource.group ? { group: resource.group } : {}),
      label: resolveOptionText(context, resource.title, resource.id),
      actions: resource.actions.map((action) => actionOption(context, action)),
    })),
    actions: [
      ...new Set(resources.flatMap((resource) => resource.actions)),
    ].map((action) => actionOption(context, action)),
  };
}

/**
 * The Collections an application can grant on: the registered ones, and only
 * those. The field pickers still read their fields from db, which owns them.
 */
async function databaseCollections(
  authz: AppAuthorizationService,
  connection: DatabaseConnection | undefined,
): Promise<readonly DatabaseCollectionOption[]> {
  if (!connection) return [];
  const described = await Promise.all(
    authz
      .getResource('database.collection')
      .items.list()
      .map(async (registration) => {
        const collection = await describeCollection(
          connection,
          registration.name,
        );
        return collection === undefined
          ? undefined
          : { ...registration, fields: collection.fields };
      }),
  );
  return described.filter((item) => item !== undefined);
}

function databaseResourceOptions(
  context: Context,
  collections: readonly DatabaseCollectionOption[],
  authz: AppAuthorizationService,
): {
  groups: object[];
  value: string;
  label: string;
  resources: readonly (Option & { actions: readonly Option[] })[];
  actions: readonly Option[];
} {
  const actions = crudActions.map((value) => actionOption(context, value));
  return {
    value: 'database.collection',
    groups: resourceGroupOptions(
      context,
      authz.getResource('database.collection').groups.list(),
    ),
    label: translateAuthorization(
      context,
      'options.resourceTypes.collection',
      'Database collections',
    ),
    resources: collections.map((collection) => ({
      value: collection.name,
      ...(collection.group ? { group: collection.group } : {}),
      label: resolveOptionText(context, collection.title, collection.name),
      ...(collection.description === undefined
        ? {}
        : {
            description: resolveOptionText(context, collection.description, ''),
          }),
      actions,
    })),
    actions,
  };
}

/** One action as this request names it; its English sentence case is the default. */
function actionOption(context: Context, value: string): Option {
  return {
    value,
    label: translateAuthorization(
      context,
      `options.actions.${value}`,
      sentenceCase(value),
    ),
  };
}

function databaseOptions(
  context: Context,
  authz: AppAuthorizationService,
  collections: readonly DatabaseCollectionOption[],
): object {
  return {
    collections: collections.map(({ name, fields }) => ({ name, fields })),
    recordAccessPolicies: authz.db.recordAccess.list().map((policy) => ({
      value: policy.key,
      label: resolveOptionText(context, policy.title, policy.key),
      ...(policy.description === undefined
        ? {}
        : {
            description: resolveOptionText(context, policy.description, ''),
          }),
    })),
  };
}

function subjectTypeOptions(
  context: Context,
  authz: AppAuthorizationService,
): readonly object[] {
  return authz.subjects.list().flatMap((type) => {
    const definition = authz.subjects.get(type)?.administration;
    if (!definition) return [];
    return [
      {
        value: type,
        label: resolveOptionText(context, definition.title, type),
        selection:
          definition.selection.type === 'fixed'
            ? { type: 'fixed', id: definition.selection.id }
            : { type: 'collection' },
      },
    ];
  });
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
