import type { ResolvedAppServerPlugins } from './types.js';

export interface AppServerInspectionIssue {
  readonly code:
    | 'SERVER_MIGRATIONS_DIRECTORY_MISSING'
    | 'SERVER_SEEDS_DIRECTORY_MISSING'
    | 'SERVER_JOB_LOCATION_MISSING'
    | 'SERVER_SCHEDULE_DEFINITIONS_MISSING';
  readonly message: string;
  readonly packageName: string;
  readonly severity: 'error';
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

export interface AppServerLocalesSnapshot {
  readonly order: number;
  readonly pluginOrder: number;
  readonly packageName: string;
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

export interface AppServerSchedulesSnapshot {
  readonly packageName: string;
  readonly configured: string;
  readonly resolved?: string;
}

export interface AppServerPluginSnapshot {
  readonly order: number;
  readonly packageName: string;
  readonly version: string;
  readonly contributions: {
    readonly serviceProviders: number;
    readonly routes: number;
    readonly locales: boolean;
    readonly migrations: boolean;
    readonly seeds: boolean;
    readonly jobLocations: number;
    readonly scheduleDefinitions: boolean;
  };
}

export interface AppServerInspectionSnapshot {
  readonly app: { readonly packageName: string };
  readonly plugins: readonly AppServerPluginSnapshot[];
  readonly serviceProviders: readonly AppServerProviderSnapshot[];
  readonly routes: readonly AppServerRouteSnapshot[];
  readonly locales: readonly AppServerLocalesSnapshot[];
  readonly database: readonly AppServerDatabaseSnapshot[];
  readonly jobs: readonly AppServerJobsSnapshot[];
  readonly schedules: readonly AppServerSchedulesSnapshot[];
  readonly consistent: boolean;
  readonly issues: readonly AppServerInspectionIssue[];
  readonly suggestions: readonly string[];
}

/**
 * Describes imported Server plugin declarations and resolved contribution locations without constructing Providers,
 * running lifecycle code, executing Route factories, loading locale resources, or loading Queue Job modules.
 * Importing the declarations remains the caller's responsibility and may execute module initialization code.
 */
export function inspectResolvedAppServerPlugins(
  resolved: ResolvedAppServerPlugins,
): AppServerInspectionSnapshot {
  const serviceProviders: AppServerProviderSnapshot[] = [];
  const routes: AppServerRouteSnapshot[] = [];
  const locales: AppServerLocalesSnapshot[] = [];
  const database: AppServerDatabaseSnapshot[] = [];
  const jobs: AppServerJobsSnapshot[] = [];
  const schedules: AppServerSchedulesSnapshot[] = [];
  const issues: AppServerInspectionIssue[] = [];

  let providerOrder = 0;
  let routeOrder = 0;
  const plugins = resolved.plugins.map((plugin, index) => {
    const pluginOrder = index + 1;
    if (plugin.definition.locales) {
      locales.push({
        order: locales.length + 1,
        pluginOrder,
        packageName: plugin.metadata.packageName,
      });
    }
    plugin.definition.serviceProviders.forEach((Provider) => {
      providerOrder += 1;
      serviceProviders.push({
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
    const configuredSchedules = plugin.definition.schedules?.definitions;
    if (configuredSchedules) {
      schedules.push({
        packageName: plugin.metadata.packageName,
        configured: configuredSchedules,
        ...(plugin.metadata.scheduleDefinitionsLocation
          ? { resolved: plugin.metadata.scheduleDefinitionsLocation }
          : {}),
      });
      if (!plugin.metadata.scheduleDefinitionsLocation) {
        issues.push({
          code: 'SERVER_SCHEDULE_DEFINITIONS_MISSING',
          severity: 'error',
          packageName: plugin.metadata.packageName,
          message: `${plugin.metadata.packageName} declares Schedule definitions at ${configuredSchedules}, but the module could not be resolved.`,
        });
      }
    }

    return {
      order: pluginOrder,
      packageName: plugin.metadata.packageName,
      version: plugin.metadata.version,
      contributions: {
        serviceProviders: plugin.definition.serviceProviders.length,
        routes: plugin.definition.routes.length,
        locales: plugin.definition.locales !== undefined,
        migrations: configuredMigrations !== undefined,
        seeds: configuredSeeds !== undefined,
        jobLocations: configuredJobs.length,
        scheduleDefinitions: configuredSchedules !== undefined,
      },
    };
  });

  return {
    app: { packageName: resolved.appPackageName },
    plugins,
    serviceProviders,
    routes,
    locales,
    database,
    jobs,
    schedules,
    consistent: issues.length === 0,
    issues,
    suggestions: suggestionsForIssues(issues),
  };
}

function suggestionsForIssues(
  issues: readonly AppServerInspectionIssue[],
): string[] {
  const suggestions = new Set<string>();
  for (const issue of issues) {
    if (
      issue.code === 'SERVER_MIGRATIONS_DIRECTORY_MISSING' ||
      issue.code === 'SERVER_SEEDS_DIRECTORY_MISSING'
    ) {
      suggestions.add(
        'Check the plugin database declaration, package files, and resolved installation contents.',
      );
    } else if (issue.code === 'SERVER_JOB_LOCATION_MISSING') {
      suggestions.add(
        'Check the plugin Queue Job declaration, package files, and resolved installation contents.',
      );
    } else if (issue.code === 'SERVER_SCHEDULE_DEFINITIONS_MISSING') {
      suggestions.add(
        'Check the plugin Schedule declaration, package files, and resolved installation contents.',
      );
    }
  }
  return [...suggestions];
}
