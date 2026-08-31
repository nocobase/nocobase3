import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const inspectionTypes = [
  'all',
  'config',
  'service-providers',
  'react-providers',
  'routes',
  'settings',
  'locales',
];

const help = `Inspect the static Client Runtime and Plugin declarations this app resolves.

Inspection imports declaration modules and evaluates lightweight contribution
factories. It does not create a ClientApplication, run ServiceProvider lifecycle
methods, load locale messages or Route page components, or render React Providers.

Usage:
  pnpm client:inspect [options]

Options:
  --type <type>      all, config, service-providers, react-providers, routes,
                     settings, or locales (default: all)
  --json             Print machine-readable JSON
  -h, --help         Show this help`;

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
  const options = { help: false, json: false, type: 'all' };
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
      if (!inspectionTypes.includes(value)) {
        throw inspectionError(
          'CLIENT_INSPECT_ARGUMENT_INVALID',
          '--type must be all, config, service-providers, react-providers, routes, settings, or locales.',
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
  type = 'all',
} = {}) {
  const packageJsonPath = path.join(appRoot, 'package.json');
  const appPackageName = JSON.parse(readFileSync(packageJsonPath, 'utf8')).name;
  const { applyClientRouteComponentOverrides, resolveAppClientContributions } =
    await import('@nocobase/app-client/plugins');
  const [application, clientPlugins] = await Promise.all([
    loadApplicationRuntime(appRoot, appPackageName),
    loadClientPlugins(appRoot),
  ]);
  const locales = localeSnapshots(
    appPackageName,
    application,
    clientPlugins.plugins,
  );
  const configs = configSnapshots(appPackageName, clientPlugins.plugins);
  const serviceProviders = serviceProviderSnapshots(
    appPackageName,
    application,
    clientPlugins.plugins,
  );

  if (type === 'locales' || type === 'config' || type === 'service-providers') {
    return createInspectionResult({
      appPackageName,
      appRoot,
      configs,
      serviceProviders,
      locales,
    });
  }

  const contributions = [
    {
      packageName: appPackageName,
      source: 'application',
      routes: resolveDeclaration(application.routes),
      reactProviders: resolveDeclaration(application.reactProviders) ?? [],
    },
    ...clientPlugins.plugins.map((plugin) => ({
      packageName: plugin.packageName,
      source: 'plugin',
      routes: plugin.routes,
      reactProviders: plugin.reactProviders,
    })),
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
  const reactProviders = resolved.reactProviders.map((provider, index) => ({
    order: index + 1,
    id: provider.id,
    name: provider.name,
    packageName: provider.packageName,
    source: provider.source,
    layer: provider.layer,
    entry: entryOf(provider.packageName, 'react-providers'),
    before: provider.before ?? [],
    after: provider.after ?? [],
  }));
  const routeSnapshots = routes.map((route, index) => {
    const override = overrides.find((entry) => entry.routeId === route.id);
    return {
      order: index + 1,
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
  });
  const settings = resolved.settings.map((setting, index) => ({
    order: index + 1,
    parent: 'settings',
    id: setting.id,
    title: setting.title,
    packageName: setting.packageName,
    path: setting.path,
    source: setting.source,
    entry: entryOf(setting.packageName, 'routes'),
    ...(setting.groupId ? { groupId: setting.groupId } : {}),
    ...(setting.access ? { access: setting.access } : {}),
  }));

  return createInspectionResult({
    appPackageName,
    appRoot,
    configs,
    serviceProviders,
    reactProviders,
    routes: routeSnapshots,
    settings,
    locales,
  });
}

function createInspectionResult({
  appPackageName,
  appRoot,
  configs = [],
  serviceProviders = [],
  reactProviders = [],
  routes = [],
  settings = [],
  locales = [],
}) {
  const issues = settings
    .filter((setting) => setting.access === undefined)
    .map((setting) => ({
      code: 'CLIENT_SETTINGS_ACCESS_MISSING',
      message: `Settings Route "${setting.id}" from "${setting.packageName}" does not declare access.`,
      packageName: setting.packageName,
      routeId: setting.id,
    }));
  return {
    app: { packageName: appPackageName, appRoot },
    configs,
    serviceProviders,
    reactProviders,
    routes,
    settings,
    locales,
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

function resolveDeclaration(declaration) {
  return typeof declaration === 'function'
    ? declaration(undefined)
    : declaration;
}

function configSnapshots(appPackageName, plugins) {
  let order = 1;
  return [
    {
      order,
      packageName: appPackageName,
      source: 'application',
      entry: './client/runtime',
      kind: 'factory',
    },
    ...plugins.flatMap((plugin) =>
      plugin.config.map((config) => ({
        order: (order += 1),
        packageName: plugin.packageName,
        source: 'plugin',
        entry: `${plugin.packageName}/client/plugin`,
        kind: 'contribution',
        namespace: config.namespace,
      })),
    ),
  ];
}

function serviceProviderSnapshots(appPackageName, application, plugins) {
  const contributions = [
    {
      packageName: appPackageName,
      source: 'application',
      Providers: resolveDeclaration(application.serviceProviders) ?? [],
      options: undefined,
    },
    ...plugins.map((plugin) => ({
      packageName: plugin.packageName,
      source: 'plugin',
      Providers: plugin.serviceProviders,
      options: plugin.options,
    })),
  ];
  let order = 0;
  return contributions.flatMap((contribution) =>
    contribution.Providers.map((Provider) => ({
      order: (order += 1),
      packageName: contribution.packageName,
      source: contribution.source,
      provider: Provider.name || '(anonymous)',
      entry:
        contribution.source === 'application'
          ? './client/providers'
          : `${contribution.packageName}/client/providers`,
      ...(hasOptions(contribution.options)
        ? { options: describeOptions(contribution.options) }
        : {}),
    })),
  );
}

function localeSnapshots(appPackageName, application, plugins) {
  return [
    ...(application.locales
      ? [{ order: 1, packageName: appPackageName, source: 'application' }]
      : []),
    ...plugins
      .filter((plugin) => plugin.locales)
      .map((plugin, index) => ({
        order: index + (application.locales ? 2 : 1),
        packageName: plugin.packageName,
        source: 'plugin',
      })),
  ];
}

function describeOverrideOrigin(origin) {
  if (origin === 'plugins-entry') return 'application (plugin options)';
  if (origin === 'route-overrides') return 'application (route-overrides)';
  return `application (${origin})`;
}

function hasOptions(options) {
  return Boolean(
    options && typeof options === 'object' && Object.keys(options).length > 0,
  );
}

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

async function loadApplicationRuntime(appRoot, packageName) {
  const entry = await findApplicationEntry(appRoot, 'runtime');
  if (!entry) {
    throw inspectionError(
      'CLIENT_RUNTIME_NOT_FOUND',
      `Application at ${appRoot} does not declare client/runtime.ts.`,
    );
  }
  try {
    const module = await import(pathToFileURL(entry).href);
    const runtime = module.default;
    if (!runtime || typeof runtime !== 'object') {
      throw inspectionError(
        'CLIENT_RUNTIME_INVALID',
        'the default export must come from defineAppRuntime()',
      );
    }
    if (runtime.packageName && runtime.packageName !== packageName) {
      throw inspectionError(
        'CLIENT_RUNTIME_INVALID',
        `client/runtime.ts declares packageName "${runtime.packageName}" instead of "${packageName}".`,
      );
    }
    return runtime;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (error instanceof ClientInspectionError) throw error;
    throw inspectionError(
      'CLIENT_RUNTIME_IMPORT_FAILED',
      `Failed to inspect client/runtime.ts: ${reason}`,
      error,
    );
  }
}

async function loadApplicationRouteComponentOverrides(appRoot) {
  const entry = ['ts', 'tsx', 'js']
    .map((extension) =>
      path.join(appRoot, `client/route-overrides.${extension}`),
    )
    .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (!entry) return [];
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
  return ['ts', 'tsx', 'js']
    .map((extension) =>
      path.join(appRoot, `client/${contribution}.${extension}`),
    )
    .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

export function formatAppClientInspection(inspection, type = 'all') {
  const sections = [`App: ${inspection.app.packageName}`];
  if (type === 'all' || type === 'config') {
    sections.push(formatConfigs(inspection.configs));
  }
  if (type === 'all' || type === 'service-providers') {
    sections.push(formatServiceProviders(inspection.serviceProviders));
  }
  if (type === 'all' || type === 'routes') {
    sections.push(formatRoutes(inspection.routes));
  }
  if (type === 'all' || type === 'settings') {
    sections.push(formatSettings(inspection.settings));
  }
  if (type === 'all' || type === 'react-providers') {
    sections.push(formatReactProviders(inspection.reactProviders));
  }
  if (type === 'all' || type === 'locales') {
    sections.push(formatLocales(inspection.locales));
  }
  sections.push(formatIssues(inspection.issues));
  sections.push(
    'Inspection scope: static Client declarations and resolved contributions only.\nConfig resolution, ServiceProvider lifecycle, locale messages, Route components, React rendering, browser behavior, and Server security are not inspected.',
  );
  return sections.join('\n\n');
}

export function selectAppClientInspection(inspection, type = 'all') {
  return {
    app: inspection.app,
    ...(type === 'all' || type === 'config'
      ? { configs: inspection.configs }
      : {}),
    ...(type === 'all' || type === 'service-providers'
      ? { serviceProviders: inspection.serviceProviders }
      : {}),
    ...(type === 'all' || type === 'routes'
      ? { routes: inspection.routes }
      : {}),
    ...(type === 'all' || type === 'settings'
      ? { settings: inspection.settings }
      : {}),
    ...(type === 'all' || type === 'react-providers'
      ? { reactProviders: inspection.reactProviders }
      : {}),
    ...(type === 'all' || type === 'locales'
      ? { locales: inspection.locales }
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
        'Check client/runtime.ts, client/plugins.ts, and registered Client declarations, then rerun client:inspect.',
      ],
    },
  };
}

function formatIssues(issues) {
  if (issues.length === 0) return 'Issues: none';
  return `Issues: ${issues.length}\n${issues
    .map((issue) => `- ${issue.code}: ${issue.message}`)
    .join('\n')}`;
}

function formatConfigs(configs) {
  if (configs.length === 0) return 'Config declarations\n  (none)';
  return `Config declarations\n${configs
    .map(
      (config) =>
        `  ${config.order}. ${config.packageName}${config.namespace ? ` (${config.namespace})` : ''}\n    source: ${config.source}\n    entry: ${config.entry}`,
    )
    .join('\n')}`;
}

function formatServiceProviders(serviceProviders) {
  if (serviceProviders.length === 0) return 'ServiceProviders\n  (none)';
  return `ServiceProviders\n${serviceProviders
    .map((provider) =>
      [
        `  ${provider.order}. ${provider.provider}`,
        `    source: ${provider.source}`,
        `    package: ${provider.packageName}`,
        `    entry: ${provider.entry}`,
        ...(provider.options ? [`    options: ${provider.options}`] : []),
      ].join('\n'),
    )
    .join('\n')}`;
}

function formatRoutes(routes) {
  if (routes.length === 0) return 'Routes\n  (none)';
  return `Routes\n${routes
    .map((route) =>
      [
        `  ${route.order}. ${route.path}`,
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
  if (settings.length === 0) return 'Settings\n  (none)';
  return `Settings\n${settings
    .map((setting) =>
      [
        `  ${setting.order}. ${setting.path}`,
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

function formatReactProviders(reactProviders) {
  if (reactProviders.length === 0) {
    return 'React Providers (outer -> inner)\n  (none)';
  }
  return `React Providers (outer -> inner)\n${reactProviders
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

function formatLocales(locales) {
  if (locales.length === 0) return 'Locale declarations\n  (none)';
  return `Locale declarations\n${locales
    .map(
      (locale) =>
        `  ${locale.order}. ${locale.packageName}\n    source: ${locale.source}`,
    )
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
    const inspection = await inspectAppClient({ type: options.type });
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
