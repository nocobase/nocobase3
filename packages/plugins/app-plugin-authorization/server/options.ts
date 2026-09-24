import type {
  AuthorizationTitle,
  RegisteredResourceType,
  ResourceItemAction,
} from '@nocobase/authorization/core';
import { databaseHost } from './database/api.js';
import { databaseRecordAccessApplicable } from './database/record-access.js';
import type { AuthorizationExtensionHost } from './host.js';
import { optionText, type OptionText } from './i18n.js';

export interface AuthorizationOptionsSection {
  readonly name: string;
  readonly title: OptionText;
  readonly order: number;
}

export interface AuthorizationOptionsGroup {
  readonly name: string;
  readonly title: OptionText;
}

export interface AuthorizationOptionsAction {
  readonly name: string;
  readonly title: OptionText;
}

export interface AuthorizationOptionsDataScope {
  readonly key: string;
  readonly title: OptionText;
  readonly collection: string;
  readonly fields: readonly string[];
  /** Record access keys a grant or rule may choose here. */
  readonly recordAccess: readonly string[];
  readonly defaultValue?: string;
}

export interface AuthorizationOptionsItem {
  readonly id: string;
  readonly title: OptionText;
  readonly description?: OptionText;
  readonly group?: string;
  readonly actions: readonly AuthorizationOptionsAction[];
  /** Business items only: the data scopes of each action. */
  readonly dataScopes?: Readonly<
    Record<string, readonly AuthorizationOptionsDataScope[]>
  >;
}

export interface AuthorizationOptionsResourceType {
  readonly type: string;
  readonly title: OptionText;
  readonly section?: string;
  readonly groups: readonly AuthorizationOptionsGroup[];
  readonly actions: readonly AuthorizationOptionsAction[];
  /** Empty for a record type such as `page`. */
  readonly items: readonly AuthorizationOptionsItem[];
}

export interface AuthorizationOptionsSubjectType {
  readonly type: string;
  readonly title: OptionText;
  readonly selection: { type: 'fixed'; id: string } | { type: 'collection' };
}

export interface AuthorizationOptionsRecordAccess {
  readonly key: string;
  readonly title: OptionText;
  readonly description?: OptionText;
  readonly collections: readonly string[];
}

/** What every `options` route answers. */
export interface AuthorizationOptions {
  readonly sections: readonly AuthorizationOptionsSection[];
  readonly resourceTypes: readonly AuthorizationOptionsResourceType[];
  readonly subjectTypes: readonly AuthorizationOptionsSubjectType[];
  readonly recordAccess: readonly AuthorizationOptionsRecordAccess[];
  readonly collections: readonly { name: string; fields: readonly string[] }[];
}

const title = (value: AuthorizationTitle | undefined, fallback: string) =>
  optionText(value, fallback);

function actionOption(action: ResourceItemAction): AuthorizationOptionsAction {
  return { name: action.name, title: title(action.title, action.name) };
}

/**
 * The workspace catalogue. `rules` narrows it to business items with data
 * scopes, which is all a rule plugin can target.
 */
export async function authorizationOptions(
  host: AuthorizationExtensionHost,
  options: { rules?: boolean } = {},
): Promise<AuthorizationOptions> {
  const database = databaseHost(host.database);
  const described = await Promise.all(
    host.database.collections.list().map(async ({ name }) => {
      const collection = await database?.describe(name);
      return collection && { name, fields: collection.fields };
    }),
  );
  const collections = described.filter((item) => item !== undefined);
  const fields = new Map(collections.map((item) => [item.name, item.fields]));
  const types = host.resourceTypes
    .list()
    .filter((type) =>
      options.rules ? type.type === 'business' : type.section !== undefined,
    )
    .map((type) => resourceTypeOption(host, type, fields, options.rules))
    .filter((type) => !options.rules || type.items.length > 0);
  return {
    sections: host.sections.list().map((section) => ({
      name: section.name,
      title: title(section.title, section.name),
      order: section.order,
    })),
    resourceTypes: types,
    subjectTypes: host.subjects.list().flatMap((type) => {
      const administration = host.subjects.get(type)?.administration;
      if (!administration) return [];
      return [
        {
          type,
          title: optionText(administration.title, type),
          selection:
            administration.selection.type === 'fixed'
              ? { type: 'fixed' as const, id: administration.selection.id }
              : { type: 'collection' as const },
        },
      ];
    }),
    recordAccess: host.recordAccess.list().map((definition) => ({
      key: definition.key,
      title: title(definition.title, definition.key),
      ...(definition.description === undefined
        ? {}
        : { description: title(definition.description, '') }),
      collections: definition.collections,
    })),
    collections,
  };
}

function resourceTypeOption(
  host: AuthorizationExtensionHost,
  type: RegisteredResourceType,
  fields: ReadonlyMap<string, readonly string[]>,
  rules = false,
): AuthorizationOptionsResourceType {
  const items = (type.items?.list() ?? []).flatMap(
    (item): AuthorizationOptionsItem[] => {
      const dataScopes =
        type.type === 'business'
          ? businessDataScopes(host, item.id, fields)
          : undefined;
      if (rules && !Object.keys(dataScopes ?? {}).length) return [];
      return [
        {
          id: item.id,
          title: title(item.title, item.id),
          ...(item.description === undefined
            ? {}
            : { description: title(item.description, '') }),
          ...(item.group === undefined ? {} : { group: item.group }),
          actions: item.actions.map(actionOption),
          ...(dataScopes && Object.keys(dataScopes).length
            ? { dataScopes }
            : {}),
        },
      ];
    },
  );
  const actions = new Map<string, AuthorizationOptionsAction>();
  for (const action of [
    ...type.actions.map(actionOption),
    ...items.flatMap((item) => item.actions),
  ])
    if (!actions.has(action.name)) actions.set(action.name, action);
  const groups = [
    ...new Set(items.flatMap((item) => (item.group ? [item.group] : []))),
  ].flatMap((name) => {
    const group = host.groups.get(name);
    return group ? [{ name, title: title(group.title, name) }] : [];
  });
  return {
    type: type.type,
    title: title(type.title, type.type),
    ...(type.section === undefined ? {} : { section: type.section }),
    groups,
    actions: [...actions.values()],
    items,
  };
}

function businessDataScopes(
  host: AuthorizationExtensionHost,
  id: string,
  fields: ReadonlyMap<string, readonly string[]>,
): Record<string, readonly AuthorizationOptionsDataScope[]> {
  const resource = host.business.list().find((entry) => entry.name === id);
  const result: Record<string, readonly AuthorizationOptionsDataScope[]> = {};
  for (const action of resource?.actions ?? []) {
    const scopes = (action.dataScopes ?? []).map((scope) => {
      const collectionFields = fields.get(scope.collection) ?? [];
      return {
        key: scope.key,
        title: title(scope.title, scope.key),
        collection: scope.collection,
        fields: collectionFields,
        recordAccess: host.recordAccess
          .listFor(scope.collection)
          .filter((definition) =>
            databaseRecordAccessApplicable(definition, collectionFields),
          )
          .filter(
            (definition) =>
              !scope.options || scope.options.includes(definition.key),
          )
          .map((definition) => definition.key),
        ...(scope.defaultValue === undefined
          ? {}
          : { defaultValue: scope.defaultValue }),
      };
    });
    if (scopes.length) result[action.name] = scopes;
  }
  return result;
}
