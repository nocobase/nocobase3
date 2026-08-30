import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const help = `Inspect the client bootstrap, routes, and providers this app resolves.

Loads client/plugins.ts and runs the same resolution the browser does, so the
output reflects the final Client contribution composition. Inspection imports
declaration modules and executes Route and Provider factories. It does not run
bootstrap functions, load Route page components, render Providers, or start a
browser.

Usage:
  pnpm client:inspect [options]

Options:
  --type <type>      all, bootstrap, routes, settings, or providers
                     (default: all)
  --json             Print machine-readable JSON
  -h, --help         Show this help

Examples:
  pnpm client:inspect
  pnpm client:inspect --json
  pnpm client:inspect --type bootstrap
  pnpm client:inspect --type settings
  pnpm client:inspect --type providers`;

export class ClientInspectionError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'ClientInspectionError';
    this.code = code;
  }
}

function inspectionError(code, message, cause) {
  return new ClientInspectionError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}

export function parseInspectAppClientArgs(args) {
  const options = {
    help: false,
    json: false,
    type: 'all',
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (argument === '--json') {
      options.json = true;
      continue;
    }
    if (argument === '--type') {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('-')) {
        throw inspectionError(
          'CLIENT_INSPECT_ARGUMENT_INVALID',
          '--type requires a value.',
        );
      }
      if (
        !['all', 'bootstrap', 'routes', 'settings', 'providers'].includes(value)
      ) {
        throw inspectionError(
          'CLIENT_INSPECT_ARGUMENT_INVALID',
          '--type must be all, bootstrap, routes, settings, or providers.',
        );
      }
      options.type = value;
      index += 1;
      continue;
    }
    throw inspectionError(
      'CLIENT_INSPECT_ARGUMENT_INVALID',
      `Unknown argument: ${argument}`,
    );
  }

  return options;
}

export async function inspectAppClient({
  appRoot = path.resolve(import.meta.dirname, '..'),
} = {}) {
  const packageJsonPath = path.join(appRoot, 'package.json');
  const appPackageName = JSON.parse(readFileSync(packageJsonPath, 'utf8')).name;
  const { applyClientRouteComponentOverrides, resolveAppClientContributions } =
    await import('@nocobase/app-client/plugins');

  const clientPlugins = await loadClientPlugins(appRoot);
  const applicationLoader = await loadApplicationLoader(appRoot);
  const contributions = [
    ...(applicationLoader
      ? [await loadContribution(applicationLoader, 'application')]
      : []),
    ...(await Promise.all(
      clientPlugins.plugins.map((plugin) => loadContribution(plugin, 'plugin')),
    )),
  ];
  let resolved;
  try {
    resolved = resolveAppClientContributions(contributions);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw inspectionError(
      'CLIENT_CONTRIBUTION_RESOLUTION_FAILED',
      `Failed to resolve Client contributions: ${reason}`,
      error,
    );
  }
  const sourceExtensions = await loadApplicationSourceExtensions(appRoot);
  const overrides = [
    ...clientPlugins.routeComponentOverrides.map((override) => ({
      ...override,
      origin: 'plugins-entry',
    })),
    ...(await loadApplicationRouteComponentOverrides(appRoot)).map(
      (override) => ({ ...override, origin: 'route-overrides' }),
    ),
    ...sourceExtensions.flatMap((extension) =>
      (extension.routeComponentOverrides ?? []).map((override) => ({
        ...override,
        origin: `extension:${extension.name}`,
      })),
    ),
  ];
  let routes;
  try {
    routes = applyClientRouteComponentOverrides(resolved.routes, overrides);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw inspectionError(
      'CLIENT_ROUTE_OVERRIDES_INVALID',
      `Failed to apply Client Route component overrides: ${reason}`,
      error,
    );
  }
  const entryOf = (packageName, contribution) =>
    packageName === appPackageName
      ? `./client/${contribution}`
      : `${packageName}/client/${contribution}`;

  const result = {
    app: {
      packageName: appPackageName,
      appRoot,
    },
    bootstraps: [
      ...(applicationLoader?.bootstrap
        ? [
            {
              order: 1,
              packageName: appPackageName,
              source: 'application',
              entry: entryOf(appPackageName, 'bootstrap'),
            },
          ]
        : []),
      ...clientPlugins.plugins
        .filter((plugin) => plugin.bootstrap)
        .map((plugin, index) => ({
          order: index + (applicationLoader?.bootstrap ? 2 : 1),
          packageName: plugin.packageName,
          source: 'plugin',
          entry: entryOf(plugin.packageName, 'bootstrap'),
          ...(hasOptions(plugin.options)
            ? { options: describeOptions(plugin.options) }
            : {}),
        })),
    ],
    routes: routes.map((route) => {
      const override = overrides.find((entry) => entry.routeId === route.id);
      return {
        parent: 'app',
        auth: route.auth,
        id: route.id,
        name: route.name,
        packageName: route.packageName,
        path: route.path,
        routeSource: route.source,
        routeEntry: entryOf(route.packageName, 'routes'),
        componentSource: override
          ? describeOverrideOrigin(override.origin)
          : route.source,
        ...(override?.componentEntry
          ? { componentEntry: override.componentEntry }
          : {}),
      };
    }),
    settings: resolved.settings.map((setting) => ({
      parent: 'settings',
      id: setting.id,
      title: setting.title,
      packageName: setting.packageName,
      path: setting.path,
      source: setting.source,
      entry: entryOf(setting.packageName, 'routes'),
      ...(setting.groupId ? { groupId: setting.groupId } : {}),
      ...(setting.access ? { access: setting.access } : {}),
    })),
    providers: resolved.providers.map((provider, index) => ({
      order: index + 1,
      id: provider.id,
      name: provider.name,
      packageName: provider.packageName,
      source: provider.source,
      layer: provider.layer,
      entry: entryOf(provider.packageName, 'providers'),
      before: provider.before ?? [],
      after: provider.after ?? [],
    })),
  };

  const issues = result.settings
    .filter((setting) => setting.access === undefined)
    .map((setting) => ({
      code: 'CLIENT_SETTINGS_ACCESS_MISSING',
      message: `Settings Route "${setting.id}" from "${setting.packageName}" does not declare access.`,
      packageName: setting.packageName,
      routeId: setting.id,
    }));

  return {
    ...result,
    consistent: issues.length === 0,
    issues,
    suggestions:
      issues.length === 0
        ? []
        : [
            'Declare resource and action access on every Settings Route, then rerun client:inspect.',
          ],
  };
}

function describeOverrideOrigin(origin) {
  if (origin === 'plugins-entry') {
    return 'application (plugin options)';
  }
  if (origin === 'route-overrides') {
    return 'application (route-overrides)';
  }
  return `application (${origin})`;
}

function hasOptions(options) {
  return Boolean(
    options && typeof options === 'object' && Object.keys(options).length > 0,
  );
}

/** Functions carry no useful text once bundled, so they render as a marker. */
function describeOptions(options) {
  return JSON.stringify(options, (_key, value) =>
    typeof value === 'function' ? '[loader]' : value,
  );
}

async function loadClientPlugins(appRoot) {
  const entry = await findApplicationEntry(appRoot, 'plugins');
  if (!entry) {
    throw inspectionError(
      'CLIENT_COMPOSITION_NOT_FOUND',
      `Application at ${appRoot} does not declare client/plugins.ts.`,
    );
  }

  try {
    const module = await import(pathToFileURL(entry).href);
    const declared = module.default;
    if (!declared || !Array.isArray(declared.plugins)) {
      throw inspectionError(
        'CLIENT_COMPOSITION_INVALID',
        'the default export must come from defineClientPlugins()',
      );
    }
    return {
      plugins: declared.plugins,
      routeComponentOverrides: declared.routeComponentOverrides ?? [],
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (error instanceof ClientInspectionError) throw error;
    throw inspectionError(
      'CLIENT_COMPOSITION_IMPORT_FAILED',
      `Failed to inspect client/plugins.ts: ${reason}`,
      error,
    );
  }
}

async function loadApplicationLoader(appRoot) {
  const entry = await findApplicationEntry(appRoot, 'application');
  if (!entry) {
    return undefined;
  }

  try {
    const module = await import(pathToFileURL(entry).href);
    if (!module.default || typeof module.default !== 'object') {
      throw inspectionError(
        'CLIENT_APPLICATION_INVALID',
        'the default export must be a client application loader',
      );
    }
    return module.default;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (error instanceof ClientInspectionError) throw error;
    throw inspectionError(
      'CLIENT_APPLICATION_IMPORT_FAILED',
      `Failed to inspect client/application.ts: ${reason}`,
      error,
    );
  }
}

/**
 * Loads one contribution the same way the browser runtime does, including the
 * factory form of routes and providers.
 */
async function loadContribution(loader, source) {
  if (!loader) {
    return {
      packageName: '',
      source,
      routes: undefined,
      providers: undefined,
    };
  }

  const [routes, providers] = await Promise.all([
    loadContributionEntry(loader, 'routes'),
    loadContributionEntry(loader, 'providers'),
  ]);

  return {
    packageName: loader.packageName,
    source,
    routes,
    providers,
  };
}

async function loadContributionEntry(loader, contribution) {
  const load = loader[contribution];
  if (!load) {
    return undefined;
  }

  try {
    const module = await load();
    const exported = module.default;
    const definitions =
      typeof exported === 'function'
        ? exported(loader.options ?? {})
        : exported;
    if (contribution === 'routes') {
      const normalized = Array.isArray(definitions)
        ? definitions
        : [definitions];
      if (
        normalized.every(
          (item) =>
            typeof item === 'object' &&
            item !== null &&
            (item.parent === 'app' || item.parent === 'settings') &&
            Array.isArray(item.routes),
        )
      ) {
        return normalized;
      }
    } else if (Array.isArray(definitions)) {
      return definitions;
    }
    {
      throw inspectionError(
        contribution === 'routes'
          ? 'CLIENT_ROUTES_INVALID'
          : 'CLIENT_PROVIDERS_INVALID',
        `the ${contribution} entry must default-export a valid contribution, or a function returning one`,
      );
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (error instanceof ClientInspectionError) throw error;
    throw inspectionError(
      contribution === 'routes'
        ? 'CLIENT_ROUTES_LOAD_FAILED'
        : 'CLIENT_PROVIDERS_LOAD_FAILED',
      `Failed to inspect client ${contribution} for "${loader.packageName}": ${reason}`,
      error,
    );
  }
}

async function loadApplicationRouteComponentOverrides(appRoot) {
  const candidates = [
    path.join(appRoot, 'client/route-overrides.ts'),
    path.join(appRoot, 'client/route-overrides.tsx'),
    path.join(appRoot, 'client/route-overrides.js'),
  ];
  const entry = candidates.find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
  if (!entry) {
    return [];
  }

  try {
    const module = await import(pathToFileURL(entry).href);
    if (!Array.isArray(module.default)) {
      throw inspectionError(
        'CLIENT_ROUTE_OVERRIDES_INVALID',
        'the default export must be an override definition array',
      );
    }
    return module.default;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (error instanceof ClientInspectionError) throw error;
    throw inspectionError(
      'CLIENT_ROUTE_OVERRIDES_IMPORT_FAILED',
      `Failed to inspect application route component overrides: ${reason}`,
      error,
    );
  }
}

async function loadApplicationSourceExtensions(appRoot) {
  const extensionsRoot = path.join(appRoot, 'client/extensions');
  if (!existsSync(extensionsRoot) || !statSync(extensionsRoot).isDirectory()) {
    return [];
  }
  const entries = readdirSync(extensionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) =>
      ['ts', 'js']
        .map((extension) =>
          path.join(extensionsRoot, entry.name, `extension.${extension}`),
        )
        .filter((candidate) => existsSync(candidate)),
    );
  const extensions = [];
  for (const entry of entries) {
    try {
      const module = await import(pathToFileURL(entry).href);
      if (!module.default || typeof module.default !== 'object') {
        throw inspectionError(
          'CLIENT_SOURCE_EXTENSION_INVALID',
          'the default export must be a source extension',
        );
      }
      extensions.push(module.default);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (error instanceof ClientInspectionError) throw error;
      throw inspectionError(
        'CLIENT_SOURCE_EXTENSION_IMPORT_FAILED',
        `Failed to inspect application source extension ${path.relative(appRoot, entry)}: ${reason}`,
        error,
      );
    }
  }
  return extensions;
}

async function findApplicationEntry(appRoot, contribution) {
  const candidates = ['ts', 'tsx', 'js'].map((extension) =>
    path.join(appRoot, `client/${contribution}.${extension}`),
  );
  return candidates.find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
}

export function formatAppClientInspection(inspection, type = 'all') {
  const sections = [`App: ${inspection.app.packageName}`];
  if (type === 'all' || type === 'bootstrap') {
    sections.push(formatBootstraps(inspection.bootstraps));
  }
  if (type === 'all' || type === 'routes') {
    sections.push(formatRoutes(inspection.routes));
  }
  if (type === 'all' || type === 'settings') {
    sections.push(formatSettings(inspection.settings));
  }
  if (type === 'all' || type === 'providers') {
    sections.push(formatProviders(inspection.providers));
  }
  sections.push(formatIssues(inspection.issues));
  sections.push(
    'Inspection scope: Client declarations and resolved contributions only.\nBootstrap, Route components, Providers, browser behavior, and Server security are not inspected.',
  );
  return sections.join('\n\n');
}

export function selectAppClientInspection(inspection, type = 'all') {
  return {
    app: inspection.app,
    ...(type === 'all' || type === 'bootstrap'
      ? { bootstraps: inspection.bootstraps }
      : {}),
    ...(type === 'all' || type === 'routes'
      ? { routes: inspection.routes }
      : {}),
    ...(type === 'all' || type === 'settings'
      ? { settings: inspection.settings }
      : {}),
    ...(type === 'all' || type === 'providers'
      ? { providers: inspection.providers }
      : {}),
    consistent: inspection.consistent,
    issues: inspection.issues,
    suggestions: inspection.suggestions,
  };
}

export function createAppClientInspectionSuccess(inspection, type = 'all') {
  return {
    schemaVersion: 1,
    ok: true,
    operation: 'client:inspect',
    status: 'success',
    result: selectAppClientInspection(inspection, type),
  };
}

export function createAppClientInspectionFailure(error) {
  return {
    schemaVersion: 1,
    ok: false,
    operation: 'client:inspect',
    status: 'failure',
    error: {
      code:
        error instanceof ClientInspectionError
          ? error.code
          : 'CLIENT_INSPECTION_FAILED',
      message: error instanceof Error ? error.message : String(error),
      suggestions: [
        'Check client/plugins.ts and registered Client declaration modules, then rerun client:inspect.',
      ],
    },
  };
}

function formatIssues(issues) {
  if (issues.length === 0) {
    return 'Issues: none';
  }
  return `Issues: ${issues.length}\n${issues
    .map((issue) => `- ${issue.code}: ${issue.message}`)
    .join('\n')}`;
}

function formatBootstraps(bootstraps) {
  if (bootstraps.length === 0) {
    return 'Bootstrap order\n  (none)';
  }
  return `Bootstrap order\n${bootstraps
    .map((bootstrap) =>
      [
        `  ${bootstrap.order}. ${bootstrap.packageName}`,
        `    source: ${bootstrap.source}`,
        `    entry: ${bootstrap.entry}`,
        ...(bootstrap.options ? [`    options: ${bootstrap.options}`] : []),
      ].join('\n'),
    )
    .join('\n')}`;
}

function formatRoutes(routes) {
  if (routes.length === 0) {
    return 'Routes\n  (none)';
  }
  return `Routes\n${routes
    .map((route) =>
      [
        `  ${route.path}`,
        `    parent: ${route.parent}`,
        `    id: ${route.id}`,
        `    auth: ${route.auth}`,
        `    route source: ${route.routeSource}`,
        `    route entry: ${route.routeEntry}`,
        `    component source: ${route.componentSource}`,
        ...(route.componentEntry
          ? [`    component entry: ${route.componentEntry}`]
          : []),
      ].join('\n'),
    )
    .join('\n')}`;
}

function formatSettings(settings) {
  if (settings.length === 0) {
    return 'Settings\n  (none)';
  }
  return `Settings\n${settings
    .map((setting) =>
      [
        `  ${setting.path}`,
        `    parent: ${setting.parent}`,
        `    id: ${setting.id}`,
        `    title: ${setting.title}`,
        ...(setting.groupId ? [`    group: ${setting.groupId}`] : []),
        `    source: ${setting.source}`,
        `    entry: ${setting.entry}`,
        ...(setting.access
          ? [
              `    access: ${setting.access.resource} / ${setting.access.action}`,
            ]
          : []),
      ].join('\n'),
    )
    .join('\n')}`;
}

function formatProviders(providers) {
  if (providers.length === 0) {
    return 'Providers (outer -> inner)\n  (none)';
  }
  return `Providers (outer -> inner)\n${providers
    .map((provider) => {
      const constraints = [
        provider.before.length > 0
          ? `    before: ${provider.before.join(', ')}`
          : undefined,
        provider.after.length > 0
          ? `    after: ${provider.after.join(', ')}`
          : undefined,
      ].filter(Boolean);
      return [
        `  ${provider.order}. ${provider.id}`,
        `    layer: ${provider.layer}`,
        `    source: ${provider.source}`,
        `    entry: ${provider.entry}`,
        ...constraints,
      ].join('\n');
    })
    .join('\n')}`;
}

async function main() {
  const jsonRequested = process.argv.slice(2).includes('--json');
  try {
    const options = parseInspectAppClientArgs(process.argv.slice(2));
    if (options.help) {
      console.log(help);
      return;
    }

    const inspection = await inspectAppClient();
    console.log(
      options.json
        ? JSON.stringify(
            createAppClientInspectionSuccess(inspection, options.type),
            null,
            2,
          )
        : formatAppClientInspection(inspection, options.type),
    );
  } catch (error) {
    if (!jsonRequested) throw error;
    console.error(
      JSON.stringify(createAppClientInspectionFailure(error), null, 2),
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  await main();
}
