import type {
  AuthorizationOptions,
  AuthorizationOptionsResponse,
  LocalizedText,
  SelectOption,
} from '../authorization-client.js';
import {
  AUTHORIZATION_NAMESPACE,
  LIBRARY_NAMESPACE,
  type Translate,
} from '../i18n.js';

/** Translates a server title; the library namespace maps onto this plugin's. */
export function localizedText(value: LocalizedText, t: Translate): string {
  if (typeof value === 'string') return value;
  const ns =
    value.ns === undefined || value.ns === LIBRARY_NAMESPACE
      ? AUTHORIZATION_NAMESPACE
      : value.ns;
  return t(value.key, { ns, defaultValue: value.defaultValue ?? value.key });
}

/** Turns an `options` response into the workspace model. */
export function localizeOptions(
  raw: AuthorizationOptionsResponse,
  t: Translate,
): AuthorizationOptions {
  const text = (value: LocalizedText): string => localizedText(value, t);
  const recordAccess = new Map(
    raw.recordAccess.map((entry) => [entry.key, text(entry.title)]),
  );
  const action = (entry: {
    name: string;
    title: LocalizedText;
  }): SelectOption => ({ value: entry.name, label: text(entry.title) });
  return {
    sections: [...raw.sections]
      .sort((left, right) => left.order - right.order)
      .map((section) => ({
        value: section.name,
        label: text(section.title),
        order: section.order,
      })),
    resourceTypes: raw.resourceTypes.map((type) => ({
      value: type.type,
      label: text(type.title),
      ...(type.section === undefined ? {} : { section: type.section }),
      groups: type.groups.map((group) => ({
        value: group.name,
        label: text(group.title),
      })),
      actions: type.actions.map(action),
      resources: type.items.map((item) => ({
        value: item.id,
        label: text(item.title),
        ...(item.description === undefined
          ? {}
          : { description: text(item.description) }),
        ...(item.group === undefined ? {} : { group: item.group }),
        actions: item.actions.map(action),
        ...(item.dataScopes
          ? {
              dataScopes: Object.fromEntries(
                Object.entries(item.dataScopes).map(([name, scopes]) => [
                  name,
                  scopes.map((scope) => ({
                    key: scope.key,
                    label: text(scope.title),
                    collection: scope.collection,
                    collectionFields: scope.fields,
                    defaultValue: scope.defaultValue ?? '',
                    options: [
                      {
                        value: '',
                        label: t('options.defaultAndSharing', {
                          ns: AUTHORIZATION_NAMESPACE,
                        }),
                      },
                      ...scope.recordAccess.map((key) => ({
                        value: key,
                        label: recordAccess.get(key) ?? key,
                      })),
                    ],
                  })),
                ]),
              ),
            }
          : {}),
      })),
    })),
    subjectTypes: raw.subjectTypes.map((type) => ({
      value: type.type,
      label: text(type.title),
      selection: type.selection,
    })),
    collections: raw.collections,
    recordAccess: raw.recordAccess.map((entry) => ({
      value: entry.key,
      label: text(entry.title),
      ...(entry.description === undefined
        ? {}
        : { description: text(entry.description) }),
    })),
  };
}

/** The data scopes rules can target on one business item, flattened. */
export function dataScopeTargets(
  options: AuthorizationOptions,
  resourceId: string,
): readonly {
  action: string;
  scopeKey: string;
  label: string;
  collection: string;
  recordAccess: readonly string[];
}[] {
  const item = options.resourceTypes
    .find((type) => type.value === 'business')
    ?.resources.find((resource) => resource.value === resourceId);
  return Object.entries(item?.dataScopes ?? {}).flatMap(([action, scopes]) =>
    scopes.map((scope) => ({
      action,
      scopeKey: scope.key,
      label: scope.label,
      collection: scope.collection,
      recordAccess: scope.options
        .map((option) => option.value)
        .filter((value) => value !== ''),
    })),
  );
}
