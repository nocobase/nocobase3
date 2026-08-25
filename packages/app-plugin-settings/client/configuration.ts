import type { AppClient } from '@nocobase/app-sdk';

export const APP_SETTINGS_CONFIGURATION_SERVICE: string =
  '@nocobase/app-plugin-settings:configuration';

export interface AppSettingsConfigurationInput {
  readonly appName: string;
  readonly returnPath: string;
}

export interface AppSettingsConfiguration {
  readonly appName: string;
  readonly basePath: string;
  readonly returnPath: string;
}

export interface AppSettingsConfigurationStore {
  configure(input: AppSettingsConfigurationInput): AppSettingsConfiguration;
  get(): AppSettingsConfiguration;
}

const DEFAULT_APP_SETTINGS_CONFIGURATION: AppSettingsConfiguration =
  Object.freeze({
    appName: 'NocoBase App',
    basePath: '/settings',
    returnPath: '/',
  });

export function createAppSettingsConfigurationStore(): AppSettingsConfigurationStore {
  let configuration = DEFAULT_APP_SETTINGS_CONFIGURATION;
  let configured = false;

  return {
    configure(input: AppSettingsConfigurationInput): AppSettingsConfiguration {
      const nextConfiguration = normalizeConfiguration(input);
      if (configured && sameConfiguration(configuration, nextConfiguration)) {
        return configuration;
      }
      if (configured) {
        throw new Error('App settings configuration is already registered.');
      }
      configuration = nextConfiguration;
      configured = true;
      return configuration;
    },
    get(): AppSettingsConfiguration {
      return configuration;
    },
  };
}

export function configureAppSettings(
  client: AppClient,
  input: AppSettingsConfigurationInput,
): AppSettingsConfiguration {
  return getOrCreateAppSettingsConfigurationStore(client).configure(input);
}

export function getAppSettingsConfiguration(
  client: AppClient,
): AppSettingsConfiguration {
  return getOrCreateAppSettingsConfigurationStore(client).get();
}

function getOrCreateAppSettingsConfigurationStore(
  client: AppClient,
): AppSettingsConfigurationStore {
  const existing = client.services.get<AppSettingsConfigurationStore>(
    APP_SETTINGS_CONFIGURATION_SERVICE,
  );
  if (existing) {
    return existing;
  }

  const store = createAppSettingsConfigurationStore();
  client.services.register(APP_SETTINGS_CONFIGURATION_SERVICE, store);
  return store;
}

function normalizeConfiguration(
  input: AppSettingsConfigurationInput,
): AppSettingsConfiguration {
  return Object.freeze({
    appName: normalizeText(input.appName, 'app name'),
    basePath: '/settings',
    returnPath: normalizePath(input.returnPath, 'return path'),
  });
}

function normalizeText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`App settings ${label} must not be empty.`);
  }
  return normalized;
}

function normalizePath(value: string, label: string): string {
  const normalized = normalizeText(value, label);
  if (!normalized.startsWith('/') || normalized.startsWith('//')) {
    throw new Error(`App settings ${label} must be an App-local path.`);
  }
  return normalized === '/' ? normalized : normalized.replace(/\/+$/, '');
}

function sameConfiguration(
  left: AppSettingsConfiguration,
  right: AppSettingsConfiguration,
): boolean {
  return (
    left.appName === right.appName &&
    left.basePath === right.basePath &&
    left.returnPath === right.returnPath
  );
}
