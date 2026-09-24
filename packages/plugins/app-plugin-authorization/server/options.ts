import type {
  AuthorizationTitle,
  ResourceItemAction,
} from '@nocobase/authorization/core';
import { databaseHost } from './database/api.js';
import { databaseRecordAccessApplicable } from './database/record-access.js';
import type { AuthorizationExtensionHost } from './host.js';
import { optionText, type OptionText } from './i18n.js';

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

/** One grantable resource, listed on the right when its subsection is selected. */
export interface AuthorizationOptionsResource {
  readonly type: string;
  readonly id: string;
  readonly title: OptionText;
  readonly description?: OptionText;
  /** A name from `resourceGroups`. */
  readonly group?: string;
  readonly actions: readonly AuthorizationOptionsAction[];
  /** Business resources only: the data scopes of each action. */
  readonly dataScopes?: Readonly<
    Record<string, readonly AuthorizationOptionsDataScope[]>
  >;
}

/** A left-side entry. */
export interface AuthorizationOptionsSubsection {
  readonly name: string;
  readonly title: OptionText;
  /**
   * Set when the client supplies the resources of a record type, such as
   * `page` from its route tree; the actions are the type's.
   */
  readonly recordType?: {
    readonly type: string;
    readonly actions: readonly AuthorizationOptionsAction[];
  };
  readonly resources: readonly AuthorizationOptionsResource[];
}

/** A left-side heading with its subsections, both in order. */
export interface AuthorizationOptionsSection {
  readonly name: string;
  readonly title: OptionText;
  readonly order: number;
  readonly subsections: readonly AuthorizationOptionsSubsection[];
}

/** A right-side heading; `parent` nests it. */
export interface AuthorizationOptionsResourceGroup {
  readonly name: string;
  readonly title: OptionText;
  readonly parent?: string;
  readonly order?: number;
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
  /** The resource groups the listed resources name, with their ancestors. */
  readonly resourceGroups?: readonly AuthorizationOptionsResourceGroup[];
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
 * The workspace catalogue: sections, their subsections and each
 * subsection's resources. `rules` narrows it to business resources with data
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
  const resources = new Map<string, AuthorizationOptionsResource[]>();
  const recordTypes = new Map<string, AuthorizationOptionsSubsection[]>();
  for (const type of host.resourceTypes.list()) {
    if (type.defaultSection === undefined) continue;
    if (options.rules && type.type !== 'business') continue;
    if (!type.items) {
      recordTypes.set(type.defaultSection, [
        ...(recordTypes.get(type.defaultSection) ?? []),
        {
          name: type.type,
          title: title(type.title, type.type),
          recordType: {
            type: type.type,
            actions: type.actions.map(actionOption),
          },
          resources: [],
        },
      ]);
      continue;
    }
    for (const item of type.items.list()) {
      const dataScopes =
        type.type === 'business'
          ? businessDataScopes(host, item.id, fields)
          : undefined;
      if (options.rules && !Object.keys(dataScopes ?? {}).length) continue;
      const section = item.section ?? host.sections.other(type.defaultSection);
      resources.set(section, [
        ...(resources.get(section) ?? []),
        {
          type: type.type,
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
      ]);
    }
  }
  const sections = host.sections.tree().map((section) => ({
    name: section.name,
    title: title(section.title, section.name),
    order: section.order,
    subsections: [
      ...(options.rules ? [] : (recordTypes.get(section.name) ?? [])),
      ...section.subsections.flatMap((subsection) => {
        const listed = resources.get(subsection.name) ?? [];
        return listed.length
          ? [
              {
                name: subsection.name,
                title: title(subsection.title, subsection.name),
                resources: listed,
              },
            ]
          : [];
      }),
    ],
  }));
  const resourceGroups = referencedGroups(host, [...resources.values()].flat());
  return {
    sections,
    ...(resourceGroups.length ? { resourceGroups } : {}),
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

/** The groups the resources name, with every ancestor, in registration order. */
function referencedGroups(
  host: AuthorizationExtensionHost,
  resources: readonly AuthorizationOptionsResource[],
): AuthorizationOptionsResourceGroup[] {
  const wanted = new Set<string>();
  for (const resource of resources) {
    let name = resource.group;
    while (name !== undefined && !wanted.has(name)) {
      wanted.add(name);
      name = host.resourceGroups.get(name)?.parent;
    }
  }
  return host.resourceGroups
    .list()
    .filter((group) => wanted.has(group.name))
    .map((group) => ({
      name: group.name,
      title: title(group.title, group.name),
      ...(group.parent === undefined ? {} : { parent: group.parent }),
      ...(group.order === undefined ? {} : { order: group.order }),
    }));
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
