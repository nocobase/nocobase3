import type { DatabaseConnection } from '@nocobase/db';
import { describeCollection } from '../database/index.js';
import { optionText, optionLabel } from '../i18n.js';
import type { AppAuthorizationService } from '../tokens.js';

interface DatabaseCollectionOption {
  readonly name: string;
  readonly fields: readonly string[];
}

/** Page entry access is configured independently of business data operations. Raw collections remain internal. */
async function managementOptions(
  authz: AppAuthorizationService,
  connection: DatabaseConnection | undefined,
) {
  const collections = await databaseCollections(authz, connection);
  return {
    plugins: ['permission-sets', 'pages', 'database'],
    resourceGroups: authz.resourceGroups.list().map((group) => ({
      value: group.name,
      category: group.category ?? 'business',
      label: optionText(group.title, group.name),
    })),
    resourceTypes: [
      ...businessResourceOptions(authz, collections),
      ...pageResourceOptions(authz),
    ],
    subjectTypes: subjectTypeOptions(authz),
    collections: collections.map(({ name, fields }) => ({ name, fields })),
    recordAccessPolicies: authz.db.recordAccess.list().map((policy) => ({
      value: policy.key,
      label: optionText(policy.title, policy.key),
      ...(policy.description === undefined
        ? {}
        : { description: optionText(policy.description, '') }),
    })),
  };
}

export async function databaseScopeRuleOptions(
  authz: AppAuthorizationService,
  connection: DatabaseConnection | undefined,
): Promise<object> {
  const options = await managementOptions(authz, connection);
  return {
    ...options,
    plugins: ['database'],
    resourceTypes: businessResourceOptions(authz, options.collections)
      .map((type) => {
        const resources = type.resources.filter(
          (resource) => resource.ruleScopes.length > 0,
        );
        return {
          ...type,
          resources,
          groups: type.groups.filter((group) =>
            resources.some((resource) => resource.group === group.value),
          ),
        };
      })
      .filter((type) => type.resources.length > 0),
  };
}

async function databaseCollections(
  authz: AppAuthorizationService,
  connection: DatabaseConnection | undefined,
): Promise<readonly DatabaseCollectionOption[]> {
  if (!connection) return [];
  const described = await Promise.all(
    authz.db.collections.list().map(async ({ name }) => {
      const collection = await describeCollection(connection, name);
      return collection && { name, fields: collection.fields };
    }),
  );
  return described.filter((item) => item !== undefined);
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

function businessResourceOptions(
  authz: AppAuthorizationService,
  collections: readonly DatabaseCollectionOption[],
) {
  const definitions = authz.resources.definitionsList();
  const fieldsByCollection = new Map(
    collections.map(({ name, fields }) => [name, fields]),
  );
  if (!definitions.length) return [];
  return [
    {
      value: 'resource',
      label: optionLabel('options.resourceTypes.business', 'Business features'),
      groups: authz.resourceGroups.list().map((group) => ({
        value: group.name,
        category: group.category ?? 'business',
        label: optionText(group.title, group.name),
      })),
      actions: [
        ...new Set(
          definitions.flatMap((resource) =>
            resource.actions.map((action) => action.name),
          ),
        ),
      ].map((value) => ({
        value,
        label: optionLabel(
          `options.actions.${value}`,
          value.charAt(0).toUpperCase() + value.slice(1),
        ),
      })),
      resources: definitions.map((resource) => {
        const scopes = resource.actions.flatMap((action) =>
          Object.entries(action.scopes ?? {}).map(([key, scope]) => {
            const fields = fieldsByCollection.get(scope.resource.id) ?? [];
            const policies = authz.db.recordAccess
              .listFor({ name: scope.resource.id, fields })
              .filter(
                (policy) =>
                  !scope.options || scope.options.includes(policy.key),
              );
            return { action: action.name, key, scope, fields, policies };
          }),
        );
        return {
          value: resource.name,
          label: optionText(resource.title, resource.name),
          group: resource.group,
          actions: resource.actions.map((action) => ({
            value: action.name,
            label: optionText(action.title, action.name),
          })),
          ruleScopes: scopes.map(({ action, key, scope, policies }) => ({
            action,
            scopeKey: key,
            label: optionText(scope.title, key),
            collection: scope.resource.id,
            policies: policies.map((policy) => policy.key),
          })),
          actionScopes: Object.fromEntries(
            resource.actions.flatMap((action) => {
              const fields = scopes
                .filter((scope) => scope.action === action.name)
                .map(({ key, scope, fields, policies }) => ({
                  key,
                  collectionFields: fields,
                  label: optionText(scope.title, key),
                  defaultValue: scope.defaultValue ?? '',
                  options: [
                    {
                      value: '',
                      label: optionLabel(
                        'options.defaultAndSharing',
                        'Default access and sharing',
                      ),
                    },
                    ...policies.map((policy) => ({
                      value: policy.key,
                      label: optionText(policy.title, policy.key),
                    })),
                  ],
                }));
              return fields.length
                ? [[action.name, { policyType: 'resource', fields }]]
                : [];
            }),
          ),
        };
      }),
    },
  ];
}

export async function permissionSetOptions(
  authz: AppAuthorizationService,
  connection: DatabaseConnection | undefined,
): Promise<object> {
  return managementOptions(authz, connection);
}

function pageResourceOptions(authz: AppAuthorizationService) {
  if (!authz.resourceTypes.list().includes('page')) return [];
  const items = authz.getResource('page').items.list();
  if (!items.length) return [];
  const actions = [
    { value: 'access', label: optionLabel('options.actions.access', 'Access') },
  ];
  return [
    {
      value: 'page',
      category: 'pages',
      label: optionLabel('options.resourceTypes.page', 'Pages'),
      groups: [] as ReturnType<
        typeof businessResourceOptions
      >[number]['groups'],
      actions,
      resources: items.map((item) => ({
        value: item.id,
        label: optionText(item.title, item.id),
        actions: item.actions.map((action) => ({
          value: action,
          label: item.actionTitles?.[action]
            ? optionText(item.actionTitles[action], action)
            : optionLabel(`options.actions.${action}`, action),
        })),
        ruleScopes: [],
        actionScopes: {},
      })),
    },
  ];
}
