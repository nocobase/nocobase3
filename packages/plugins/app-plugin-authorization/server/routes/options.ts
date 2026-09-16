import type { ResourceGroup } from '@nocobase/authorization/core';
import type { DatabaseConnection } from '@nocobase/db';
import { describeCollection } from '../database/index.js';
import { optionText, optionLabel, type OptionText } from '../i18n.js';
import type { AppAuthorizationService } from '../tokens.js';

/** One grantable Collection: its registration, plus the fields db reports. */
interface DatabaseCollectionOption {
  group?: string;
  readonly name: string;
  readonly title?: OptionText;
  readonly description?: OptionText;
  readonly fields: readonly string[];
}

/** Display text stays literal or retains its translation descriptor on the wire. */
interface Option {
  readonly value: string;
  readonly label: OptionText;
  readonly description?: OptionText;
}

const crudActions = ['read', 'create', 'update', 'delete'] as const;
export async function permissionSetOptions(
  authz: AppAuthorizationService,
  connection: DatabaseConnection | undefined,
): Promise<object> {
  const collections = await databaseCollections(authz, connection);
  const access = [actionOption('access')];
  return {
    plugins: ['permission-sets', 'pages', 'database'],
    resourceTypes: [
      {
        value: 'page',
        groups: authz.resources.get('page')
          ? resourceGroupOptions(authz.getResource('page').groups.list())
          : [],
        label: optionLabel('options.resourceTypes.page', 'Pages'),
        resources: [
          ...(authz.resources.get('page')
            ? authz
                .getResource('page')
                .items.list()
                .map((item) => ({
                  value: item.id,
                  label: optionText(item.title, item.id),
                  ...(item.group ? { group: item.group } : {}),
                  actions: item.actions.map((action) => actionOption(action)),
                }))
            : []),
        ],
        actions: access,
      },
      databaseResourceOptions(collections, authz),
      administrationOptions(authz),
    ],
    subjectTypes: subjectTypeOptions(authz),
    ...databaseOptions(authz, collections),
  };
}

export async function databaseScopeRuleOptions(
  authz: AppAuthorizationService,
  connection: DatabaseConnection | undefined,
): Promise<object> {
  const collections = await databaseCollections(authz, connection);
  const collection = databaseResourceOptions(collections, authz);
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
    subjectTypes: subjectTypeOptions(authz),
    ...databaseOptions(authz, collections),
  };
}

function resourceGroupOptions(groups: readonly ResourceGroup[]): object[] {
  return groups.map((group) => ({
    value: group.id,
    label: optionText(group.title, group.id),
    ...(group.children
      ? { children: resourceGroupOptions(group.children) }
      : {}),
  }));
}

function administrationOptions(authz: AppAuthorizationService): object {
  const settings = authz.getResource('settings');
  const resources = settings.items.list();
  return {
    value: 'settings',
    label: optionLabel('options.resourceTypes.settings', 'Admin settings'),
    groups: resourceGroupOptions(settings.groups.list()),
    resources: resources.map((resource) => ({
      value: resource.id,
      ...(resource.group ? { group: resource.group } : {}),
      label: optionText(resource.title, resource.id),
      actions: resource.actions.map((action) => actionOption(action)),
    })),
    actions: [
      ...new Set(resources.flatMap((resource) => resource.actions)),
    ].map((action) => actionOption(action)),
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
  collections: readonly DatabaseCollectionOption[],
  authz: AppAuthorizationService,
): {
  groups: object[];
  value: string;
  label: OptionText;
  resources: readonly (Option & { actions: readonly Option[] })[];
  actions: readonly Option[];
} {
  const actions = crudActions.map((value) => actionOption(value));
  return {
    value: 'database.collection',
    groups: resourceGroupOptions(
      authz.getResource('database.collection').groups.list(),
    ),
    label: optionLabel(
      'options.resourceTypes.collection',
      'Database collections',
    ),
    resources: collections.map((collection) => ({
      value: collection.name,
      ...(collection.group ? { group: collection.group } : {}),
      label: optionText(collection.title, collection.name),
      ...(collection.description === undefined
        ? {}
        : {
            description: optionText(collection.description, ''),
          }),
      actions,
    })),
    actions,
  };
}

/** Built-in action vocabulary with a readable fallback for custom actions. */
function actionOption(value: string): Option {
  return {
    value,
    label: optionLabel(`options.actions.${value}`, sentenceCase(value)),
  };
}

function databaseOptions(
  authz: AppAuthorizationService,
  collections: readonly DatabaseCollectionOption[],
): object {
  return {
    collections: collections.map(({ name, fields }) => ({ name, fields })),
    recordAccessPolicies: authz.db.recordAccess.list().map((policy) => ({
      value: policy.key,
      label: optionText(policy.title, policy.key),
      ...(policy.description === undefined
        ? {}
        : {
            description: optionText(policy.description, ''),
          }),
    })),
  };
}

function subjectTypeOptions(authz: AppAuthorizationService): readonly object[] {
  return authz.subjects.list().flatMap((type) => {
    const definition = authz.subjects.get(type)?.administration;
    if (!definition) return [];
    return [
      {
        value: type,
        label: optionText(definition.title, type),
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
