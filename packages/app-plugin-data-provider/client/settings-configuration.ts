import type { AppClient } from '@nocobase/app-sdk';

export const APP_DATA_SOURCE_SETTINGS_SERVICE: string =
  '@nocobase/app-plugin-data-provider:settings';

export interface AppDataSourceCollectionInput {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly route?: string;
}

export interface AppDataSourceSettingsInput {
  readonly description: string;
  readonly collections: readonly AppDataSourceCollectionInput[];
}

export interface AppDataSourceCollection {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly route?: string;
}

export interface AppDataSourceSettings {
  readonly description: string;
  readonly collections: readonly AppDataSourceCollection[];
}

export function configureAppDataSourceSettings(
  appClient: AppClient,
  input: AppDataSourceSettingsInput,
): AppDataSourceSettings {
  const next = normalizeSettings(input);
  const current = appClient.services.get<AppDataSourceSettings>(
    APP_DATA_SOURCE_SETTINGS_SERVICE,
  );
  if (current) {
    if (settingsEqual(current, next)) return current;
    throw new Error('App data source settings are already configured.');
  }
  appClient.services.register(APP_DATA_SOURCE_SETTINGS_SERVICE, next);
  return next;
}

export function getAppDataSourceSettings(
  appClient: AppClient,
): AppDataSourceSettings {
  return (
    appClient.services.get<AppDataSourceSettings>(
      APP_DATA_SOURCE_SETTINGS_SERVICE,
    ) ?? DEFAULT_DATA_SOURCE_SETTINGS
  );
}

const DEFAULT_DATA_SOURCE_SETTINGS: AppDataSourceSettings = Object.freeze({
  description: '查看当前 App 使用的数据连接、运行状态和承载的业务数据。',
  collections: Object.freeze([]),
});

function normalizeSettings(
  input: AppDataSourceSettingsInput,
): AppDataSourceSettings {
  const seen = new Set<string>();
  const collections = input.collections.map((collection) => {
    const name = requiredText(collection.name, 'collection name');
    if (seen.has(name)) {
      throw new Error(`Duplicate App data source collection "${name}".`);
    }
    seen.add(name);
    const route = collection.route
      ? normalizeAppRoute(collection.route)
      : undefined;
    return Object.freeze({
      name,
      title: requiredText(collection.title, 'collection title'),
      description: requiredText(
        collection.description,
        'collection description',
      ),
      ...(route ? { route } : {}),
    });
  });
  return Object.freeze({
    description: requiredText(input.description, 'description'),
    collections: Object.freeze(collections),
  });
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`App data source ${label} is required.`);
  return normalized;
}

function normalizeAppRoute(value: string): string {
  const route = value.trim();
  if (!route.startsWith('/') || route.startsWith('//')) {
    throw new Error('App data source routes must be root-relative paths.');
  }
  const parsed = new URL(route, 'https://app.invalid');
  if (parsed.origin !== 'https://app.invalid') {
    throw new Error('App data source routes must stay inside the current App.');
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function settingsEqual(
  left: AppDataSourceSettings,
  right: AppDataSourceSettings,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
