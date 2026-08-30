import type { ApplicationConfig } from '../application/index.js';
import type { ResolvedAppServerPlugins } from './types.js';

export interface AppServerInspectionIssue {
  readonly code:
    | 'SERVER_MIGRATIONS_DIRECTORY_MISSING'
    | 'SERVER_SEEDS_DIRECTORY_MISSING'
    | 'SERVER_JOB_LOCATION_MISSING';
  readonly message: string;
  readonly packageName: string;
  readonly severity: 'error';
}

export interface AppServerInspectionLimitation {
  readonly code:
    | 'SERVER_PROVIDER_TOKEN_METADATA_UNAVAILABLE'
    | 'SERVER_ROUTE_METADATA_UNAVAILABLE'
    | 'SERVER_JOB_METADATA_UNAVAILABLE';
  readonly message: string;
}

export interface AppServerProviderSnapshot {
  readonly order: number;
  readonly pluginOrder: number;
  readonly packageName: string;
  readonly constructorName: string;
}

export interface AppServerRouteSnapshot {
  readonly order: number;
  readonly pluginOrder: number;
  readonly contributionOrder: number;
  readonly packageName: string;
  readonly scope: 'api' | 'root';
}

export interface AppServerDatabaseSnapshot {
  readonly packageName: string;
  readonly migrations?: {
    readonly configured: string;
    readonly resolved?: string;
  };
  readonly seeds?: {
    readonly configured: string;
    readonly resolved?: string;
  };
}

export interface AppServerJobsSnapshot {
  readonly packageName: string;
  readonly configuredLocations: readonly string[];
  readonly resolvedLocations: readonly string[];
}

export interface AppServerPluginSnapshot {
  readonly order: number;
  readonly packageName: string;
  readonly version: string;
  readonly rootDir: string;
  readonly contributions: {
    readonly providers: number;
    readonly routes: number;
    readonly migrations: boolean;
    readonly seeds: boolean;
    readonly jobLocations: number;
  };
}

export interface AppServerInspectionSnapshot {
  readonly app: { readonly packageName: string };
  readonly plugins: readonly AppServerPluginSnapshot[];
  readonly providers: readonly AppServerProviderSnapshot[];
  readonly routes: {
    readonly api: readonly AppServerRouteSnapshot[];
    readonly root: readonly AppServerRouteSnapshot[];
  };
  readonly database: readonly AppServerDatabaseSnapshot[];
  readonly jobs: readonly AppServerJobsSnapshot[];
  readonly issues: readonly AppServerInspectionIssue[];
  readonly limitations: readonly AppServerInspectionLimitation[];
}

/**
 * Describes resolved Server composition without constructing providers, running lifecycle code, creating routers, or
 * loading Queue Job modules.
 */
export function inspectResolvedAppServerPlugins<
  TConfig extends ApplicationConfig = ApplicationConfig,
>(resolved: ResolvedAppServerPlugins<TConfig>): AppServerInspectionSnapshot {
  const providers: AppServerProviderSnapshot[] = [];
  const routes: AppServerRouteSnapshot[] = [];
  const database: AppServerDatabaseSnapshot[] = [];
  const jobs: AppServerJobsSnapshot[] = [];
  const issues: AppServerInspectionIssue[] = [];

  let providerOrder = 0;
  let routeOrder = 0;
  const plugins = resolved.plugins.map((plugin, index) => {
    const pluginOrder = index + 1;
    plugin.definition.providers.forEach((Provider) => {
      providerOrder += 1;
      providers.push({
        order: providerOrder,
        pluginOrder,
        packageName: plugin.metadata.packageName,
        constructorName: Provider.name || '(anonymous)',
      });
    });
    plugin.definition.routes.forEach((route, routeIndex) => {
      routeOrder += 1;
      routes.push({
        order: routeOrder,
        pluginOrder,
        contributionOrder: routeIndex + 1,
        packageName: plugin.metadata.packageName,
        scope: route.scope,
      });
    });

    const configuredMigrations = plugin.definition.database?.migrations;
    const configuredSeeds = plugin.definition.database?.seeds;
    if (configuredMigrations || configuredSeeds) {
      database.push({
        packageName: plugin.metadata.packageName,
        ...(configuredMigrations
          ? {
              migrations: {
                configured: configuredMigrations,
                ...(plugin.metadata.migrationsDirectory
                  ? { resolved: plugin.metadata.migrationsDirectory }
                  : {}),
              },
            }
          : {}),
        ...(configuredSeeds
          ? {
              seeds: {
                configured: configuredSeeds,
                ...(plugin.metadata.seedsDirectory
                  ? { resolved: plugin.metadata.seedsDirectory }
                  : {}),
              },
            }
          : {}),
      });
    }
    if (configuredMigrations && !plugin.metadata.migrationsDirectory) {
      issues.push({
        code: 'SERVER_MIGRATIONS_DIRECTORY_MISSING',
        severity: 'error',
        packageName: plugin.metadata.packageName,
        message: `${plugin.metadata.packageName} declares migrations at ${configuredMigrations}, but the directory could not be resolved.`,
      });
    }
    if (configuredSeeds && !plugin.metadata.seedsDirectory) {
      issues.push({
        code: 'SERVER_SEEDS_DIRECTORY_MISSING',
        severity: 'error',
        packageName: plugin.metadata.packageName,
        message: `${plugin.metadata.packageName} declares seeds at ${configuredSeeds}, but the directory could not be resolved.`,
      });
    }

    const configuredJobs = plugin.definition.queue?.jobs ?? [];
    if (configuredJobs.length > 0) {
      jobs.push({
        packageName: plugin.metadata.packageName,
        configuredLocations: configuredJobs,
        resolvedLocations: plugin.metadata.jobLocations,
      });
      if (plugin.metadata.jobLocations.length < configuredJobs.length) {
        issues.push({
          code: 'SERVER_JOB_LOCATION_MISSING',
          severity: 'error',
          packageName: plugin.metadata.packageName,
          message: `${plugin.metadata.packageName} declares ${configuredJobs.length} Job location(s), but only ${plugin.metadata.jobLocations.length} could be resolved.`,
        });
      }
    }

    return {
      order: pluginOrder,
      packageName: plugin.metadata.packageName,
      version: plugin.metadata.version,
      rootDir: plugin.metadata.rootDir,
      contributions: {
        providers: plugin.definition.providers.length,
        routes: plugin.definition.routes.length,
        migrations: configuredMigrations !== undefined,
        seeds: configuredSeeds !== undefined,
        jobLocations: configuredJobs.length,
      },
    };
  });

  return {
    app: { packageName: resolved.appPackageName },
    plugins,
    providers,
    routes: {
      api: routes.filter((route) => route.scope === 'api'),
      root: routes.filter((route) => route.scope === 'root'),
    },
    database,
    jobs,
    issues,
    limitations: [
      {
        code: 'SERVER_PROVIDER_TOKEN_METADATA_UNAVAILABLE',
        message:
          'Provider token ownership and dependencies are runtime behavior and are not declared by the current Provider contract.',
      },
      {
        code: 'SERVER_ROUTE_METADATA_UNAVAILABLE',
        message:
          'Route methods, paths, authentication, and authorization are created inside Route factories and are not statically inspectable.',
      },
      {
        code: 'SERVER_JOB_METADATA_UNAVAILABLE',
        message:
          'Job names, queues, payloads, and runtime collisions are unavailable until Job modules are loaded.',
      },
    ],
  };
}
