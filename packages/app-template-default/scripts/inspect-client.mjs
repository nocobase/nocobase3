import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const help = `Inspect the client bootstrap, routes, and providers this app resolves.

Loads client/plugins.ts and runs the same resolution the browser does, so the
output reflects what the app will actually render.

Usage:
  pnpm client:inspect [options]

Options:
  --type <type>      all, bootstrap, routes, or providers (default: all)
  --json             Print machine-readable JSON
  -h, --help         Show this help

Examples:
  pnpm client:inspect
  pnpm client:inspect --json
  pnpm client:inspect --type bootstrap
  pnpm client:inspect --type providers`;

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
        throw new Error('--type requires a value.');
      }
      if (!['all', 'bootstrap', 'routes', 'providers'].includes(value)) {
        throw new Error('--type must be all, bootstrap, routes, or providers.');
      }
      options.type = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
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
    await loadContribution(applicationLoader, 'application'),
    ...(await Promise.all(
      clientPlugins.plugins.map((plugin) => loadContribution(plugin, 'plugin')),
    )),
  ];
  const resolved = resolveAppClientContributions(contributions);
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
  const routes = applyClientRouteComponentOverrides(resolved.routes, overrides);
  const entryOf = (packageName, contribution) =>
    packageName === appPackageName
      ? `./client/${contribution}`
      : `${packageName}/client/${contribution}`;

  return {
    app: appPackageName,
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
    throw new Error(
      `Application at ${appRoot} does not declare client/plugins.ts.`,
    );
  }

  try {
    const module = await import(pathToFileURL(entry).href);
    const declared = module.default;
    if (!declared || !Array.isArray(declared.plugins)) {
      throw new Error(
        'the default export must come from defineClientPlugins()',
      );
    }
    return {
      plugins: declared.plugins,
      routeComponentOverrides: declared.routeComponentOverrides ?? [],
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to inspect client/plugins.ts: ${reason}`, {
      cause: error,
    });
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
      throw new Error('the default export must be a client application loader');
    }
    return module.default;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to inspect client/application.ts: ${reason}`, {
      cause: error,
    });
  }
}

/**
 * Loads one contribution the same way the browser runtime does, including the
 * factory form of routes and providers.
 */
async function loadContribution(loader, source) {
  if (!loader) {
    return { packageName: '', source, routes: undefined, providers: undefined };
  }

  const [routes, providers] = await Promise.all([
    loadContributionEntry(loader, 'routes'),
    loadContributionEntry(loader, 'providers'),
  ]);

  return { packageName: loader.packageName, source, routes, providers };
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
    if (!Array.isArray(definitions)) {
      throw new Error(
        `the ${contribution} entry must default-export a definition array, or a function returning one`,
      );
    }
    return definitions;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to inspect client ${contribution} for "${loader.packageName}": ${reason}`,
      { cause: error },
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

    const inspection = await inspectAppClient();
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
    console.error('Run pnpm client:inspect --help for usage.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  await main();
}
