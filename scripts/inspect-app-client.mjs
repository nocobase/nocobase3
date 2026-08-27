import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { DEFAULT_APP, resolveApplication } from './register-plugin.mjs';

const help = `Inspect resolved client bootstrap, routes, and providers for an application.

Usage:
  pnpm app:client:inspect [options]

Options:
  --app <app>        Application directory or package name
                     (default: app-template-default)
  --type <type>      all, bootstrap, routes, or providers (default: all)
  --json             Print machine-readable JSON
  -h, --help         Show this help

Examples:
  pnpm app:client:inspect
  pnpm app:client:inspect --app app-template-default
  pnpm app:client:inspect --app @nocobase/app-template-default --json
  pnpm app:client:inspect --type bootstrap
  pnpm app:client:inspect --type providers`;

export function parseInspectAppClientArgs(args) {
  const options = {
    app: DEFAULT_APP,
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
    if (argument === '--app' || argument === '--type') {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('-')) {
        throw new Error(`${argument} requires a value.`);
      }
      if (argument === '--app') {
        options.app = value;
      } else {
        if (!['all', 'bootstrap', 'routes', 'providers'].includes(value)) {
          throw new Error(
            '--type must be all, bootstrap, routes, or providers.',
          );
        }
        options.type = value;
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

export async function inspectAppClient({
  app = DEFAULT_APP,
  repoRoot = path.resolve(import.meta.dirname, '..'),
} = {}) {
  const application = await resolveApplication(repoRoot, app);
  const appRoot = path.dirname(application.packageJsonPath);
  const [
    { resolveAppPlugins },
    { applyClientRouteComponentOverrides, resolveAppClientContributions },
  ] = await Promise.all([
    import('../packages/app-server/src/plugins/index.js'),
    import('../packages/app-client/src/plugins.js'),
  ]);
  const resolvedApp = resolveAppPlugins(appRoot);
  const clientPlugins = resolvedApp.plugins.filter(
    (plugin) => plugin.enabled && plugin.manifest.client,
  );
  const [applicationRoutes, applicationProviders, applicationBootstrapEntry] =
    await Promise.all([
      loadApplicationDefinitions(appRoot, 'routes'),
      loadApplicationDefinitions(appRoot, 'providers'),
      findApplicationEntry(appRoot, 'bootstrap'),
    ]);
  const pluginContributions = await Promise.all(
    clientPlugins.map(async (plugin) => ({
      packageName: plugin.packageName,
      source: 'plugin',
      routes: await loadDefinitions(plugin, 'routes'),
      providers: await loadDefinitions(plugin, 'providers'),
    })),
  );
  const contributions = [
    {
      packageName: resolvedApp.appPackageName,
      source: 'application',
      routes: applicationRoutes,
      providers: applicationProviders,
    },
    ...pluginContributions,
  ];
  const resolved = resolveAppClientContributions(contributions);
  const [declaredRouteComponentOverrides, sourceExtensions] = await Promise.all(
    [
      loadApplicationRouteComponentOverrides(appRoot),
      loadApplicationSourceExtensions(appRoot),
    ],
  );
  const routeComponentOverrides = [
    ...declaredRouteComponentOverrides,
    ...sourceExtensions.flatMap(
      (extension) => extension.routeComponentOverrides ?? [],
    ),
  ];
  const finalRoutes = applyClientRouteComponentOverrides(
    resolved.routes,
    routeComponentOverrides,
  );
  const entries = new Map(
    clientPlugins.map((plugin) => [plugin.packageName, plugin.manifest.client]),
  );
  const applicationEntries = {
    bootstrap: applicationBootstrapEntry ? './client/bootstrap' : undefined,
    providers: applicationProviders ? './client/providers' : undefined,
    routes: applicationRoutes ? './client/routes' : undefined,
  };

  return {
    app: resolvedApp.appPackageName,
    bootstraps: [
      ...(applicationEntries.bootstrap
        ? [
            {
              order: 1,
              packageName: resolvedApp.appPackageName,
              source: 'application',
              entry: applicationEntries.bootstrap,
            },
          ]
        : []),
      ...clientPlugins
        .filter((plugin) => plugin.manifest.client?.bootstrap)
        .map((plugin, index) => ({
          order: index + (applicationEntries.bootstrap ? 2 : 1),
          packageName: plugin.packageName,
          source: 'plugin',
          entry: formatPluginClientEntry(
            plugin.packageName,
            plugin.manifest.client.bootstrap,
          ),
        })),
    ],
    routes: finalRoutes.map((route) => ({
      auth: route.auth,
      id: route.id,
      name: route.name,
      packageName: route.packageName,
      path: route.path,
      entry:
        route.source === 'application'
          ? applicationEntries.routes
          : entries.get(route.packageName)?.routes,
      routeSource: route.source,
      routeEntry:
        route.source === 'application'
          ? applicationEntries.routes
          : formatPluginClientEntry(
              route.packageName,
              entries.get(route.packageName)?.routes,
            ),
      componentSource: routeComponentOverrides.some(
        (override) => override.routeId === route.id,
      )
        ? 'application'
        : route.source,
      componentEntry: routeComponentOverrides.find(
        (override) => override.routeId === route.id,
      )?.componentEntry,
    })),
    providers: resolved.providers.map((provider, index) => ({
      order: index + 1,
      id: provider.id,
      name: provider.name,
      packageName: provider.packageName,
      source: provider.source,
      layer: provider.layer,
      entry:
        provider.source === 'application'
          ? applicationEntries.providers
          : formatPluginClientEntry(
              provider.packageName,
              entries.get(provider.packageName)?.providers,
            ),
      before: provider.before ?? [],
      after: provider.after ?? [],
    })),
  };
}

function formatPluginClientEntry(packageName, entry) {
  return entry?.startsWith('./') ? `${packageName}/${entry.slice(2)}` : entry;
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
      throw new Error(
        'the default export must be an override definition array',
      );
    }
    return module.default;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to inspect application route component overrides: ${reason}`,
      { cause: error },
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
        throw new Error('the default export must be a source extension');
      }
      extensions.push(module.default);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to inspect application source extension ${path.relative(appRoot, entry)}: ${reason}`,
        { cause: error },
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

async function loadApplicationDefinitions(appRoot, contribution) {
  const entry = await findApplicationEntry(appRoot, contribution);
  if (!entry) {
    return undefined;
  }

  try {
    const module = await import(pathToFileURL(entry).href);
    if (!Array.isArray(module.default)) {
      throw new Error('the default export must be a definition array');
    }
    return module.default;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to inspect application client ${contribution}: ${reason}`,
      { cause: error },
    );
  }
}

async function loadDefinitions(plugin, contribution) {
  const configuredEntry = plugin.manifest.client?.[contribution];
  if (!configuredEntry) {
    return undefined;
  }
  const resolvedEntry =
    contribution === 'routes'
      ? plugin.clientRoutesEntry
      : plugin.clientProvidersEntry;
  if (!resolvedEntry) {
    throw new Error(
      `Plugin "${plugin.packageName}" client ${contribution} entry could not be resolved: ${configuredEntry}`,
    );
  }

  try {
    const module = await import(pathToFileURL(resolvedEntry).href);
    if (!Array.isArray(module.default)) {
      throw new Error('the default export must be a definition array');
    }
    return module.default;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to inspect client ${contribution} for plugin "${plugin.packageName}": ${reason}`,
      { cause: error },
    );
  }
}

export function formatAppClientInspection(inspection, type = 'all') {
  const sections = [`App: ${inspection.app}`];
  if (type === 'all' || type === 'bootstrap') {
    sections.push(formatBootstraps(inspection.bootstraps));
  }
  if (type === 'all' || type === 'routes') {
    sections.push(formatRoutes(inspection.routes));
  }
  if (type === 'all' || type === 'providers') {
    sections.push(formatProviders(inspection.providers));
  }
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
    ...(type === 'all' || type === 'providers'
      ? { providers: inspection.providers }
      : {}),
  };
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
  try {
    const options = parseInspectAppClientArgs(process.argv.slice(2));
    if (options.help) {
      console.log(help);
      return;
    }

    const inspection = await inspectAppClient({ app: options.app });
    console.log(
      options.json
        ? JSON.stringify(
            selectAppClientInspection(inspection, options.type),
            null,
            2,
          )
        : formatAppClientInspection(inspection, options.type),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error('Run pnpm app:client:inspect --help for usage.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  await main();
}
