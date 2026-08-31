import type { AppConfigContribution } from '../config/index.js';
import type {
  AppServerPlugin,
  AppServerPluginDefinition,
  AppServerPlugins,
} from './types.js';

const PACKAGE_NAME_PATTERN = /^@[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;

export function defineServerPlugin<TConfig = object>(
  definition: AppServerPluginDefinition<TConfig>,
): AppServerPlugin<TConfig> {
  const packageName = normalizePackageName(definition.packageName);

  return Object.freeze({
    packageName,
    config: Object.freeze(normalizeConfigDefinitions(definition.config)),
    serviceProviders: Object.freeze([...(definition.serviceProviders ?? [])]),
    routes: Object.freeze([...(definition.routes ?? [])]),
    database: definition.database
      ? Object.freeze({ ...definition.database })
      : undefined,
    queue: definition.queue
      ? Object.freeze({
          ...definition.queue,
          jobs: definition.queue.jobs
            ? Object.freeze([...definition.queue.jobs])
            : undefined,
        })
      : undefined,
    locales: definition.locales,
  });
}

export function defineServerPlugins(
  plugins: readonly AppServerPlugin[],
): AppServerPlugins {
  const seen = new Set<string>();
  for (const plugin of plugins) {
    if (seen.has(plugin.packageName)) {
      throw new Error(
        `Server plugin "${plugin.packageName}" is registered more than once.`,
      );
    }
    seen.add(plugin.packageName);
  }

  return Object.freeze({ plugins: Object.freeze([...plugins]) });
}

function normalizeConfigDefinitions(
  value:
    | AppConfigContribution<never>
    | readonly AppConfigContribution<never>[]
    | undefined,
): readonly AppConfigContribution<never>[] {
  if (value === undefined) return [];
  return isConfigDefinitionArray(value) ? [...value] : [value];
}

function isConfigDefinitionArray(
  value: AppConfigContribution<never> | readonly AppConfigContribution<never>[],
): value is readonly AppConfigContribution<never>[] {
  return Array.isArray(value);
}

function normalizePackageName(packageName: string): string {
  const normalized = packageName.trim();
  if (!PACKAGE_NAME_PATTERN.test(normalized)) {
    throw new Error(
      `Server plugin package name "${packageName}" must be a valid scoped package name.`,
    );
  }
  return normalized;
}
