import { assertNoQueueContribution } from './queue-contribution.js';
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
  assertNoQueueContribution(definition);

  return Object.freeze({
    packageName,
    serviceProviders: Object.freeze([...(definition.serviceProviders ?? [])]),
    routes: Object.freeze([...(definition.routes ?? [])]),
    database: definition.database
      ? Object.freeze({ ...definition.database })
      : undefined,
    locales: definition.locales,
  });
}

export function defineServerPlugins(
  plugins: readonly AppServerPlugin[],
): AppServerPlugins {
  const seen = new Set<string>();
  for (const plugin of plugins) {
    assertNoQueueContribution(plugin);
    if (seen.has(plugin.packageName)) {
      throw new Error(
        `Server plugin "${plugin.packageName}" is registered more than once.`,
      );
    }
    seen.add(plugin.packageName);
  }

  return Object.freeze({ plugins: Object.freeze([...plugins]) });
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
