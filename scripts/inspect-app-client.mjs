import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { DEFAULT_APP, resolveApplication } from './register-plugin.mjs';

const help = `Inspect resolved client routes and providers for an application.

Usage:
  pnpm app:client:inspect [options]

Options:
  --app <app>        Application directory or package name
                     (default: app-template-default)
  --type <type>      all, routes, or providers (default: all)
  --json             Print machine-readable JSON
  -h, --help         Show this help

Examples:
  pnpm app:client:inspect
  pnpm app:client:inspect --app app-template-default
  pnpm app:client:inspect --app @nocobase/app-template-default --json
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
        if (!['all', 'routes', 'providers'].includes(value)) {
          throw new Error('--type must be all, routes, or providers.');
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
  const [{ resolveAppPlugins }, { resolveAppClientContributions }] =
    await Promise.all([
      import('../packages/app-template-default/server/plugins/index.js'),
      import('../packages/app-client/src/plugins.js'),
    ]);
  const resolvedApp = resolveAppPlugins(appRoot);
  const clientPlugins = resolvedApp.plugins.filter(
    (plugin) => plugin.enabled && plugin.manifest.client,
  );
  const contributions = await Promise.all(
    clientPlugins.map(async (plugin) => ({
      packageName: plugin.packageName,
      routes: await loadDefinitions(plugin, 'routes'),
      providers: await loadDefinitions(plugin, 'providers'),
    })),
  );
  const resolved = resolveAppClientContributions(contributions);
  const entries = new Map(
    clientPlugins.map((plugin) => [plugin.packageName, plugin.manifest.client]),
  );

  return {
    app: resolvedApp.appPackageName,
    routes: resolved.routes.map((route) => ({
      auth: route.auth,
      id: route.id,
      name: route.name,
      packageName: route.packageName,
      path: route.path,
      entry: entries.get(route.packageName)?.routes,
    })),
    providers: resolved.providers.map((provider, index) => ({
      order: index + 1,
      id: provider.id,
      name: provider.name,
      packageName: provider.packageName,
      entry: entries.get(provider.packageName)?.providers,
      before: provider.before ?? [],
      after: provider.after ?? [],
    })),
  };
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
    ...(type === 'all' || type === 'routes'
      ? { routes: inspection.routes }
      : {}),
    ...(type === 'all' || type === 'providers'
      ? { providers: inspection.providers }
      : {}),
  };
}

function formatRoutes(routes) {
  if (routes.length === 0) {
    return 'Routes\n  (none)';
  }
  return `Routes\n${routes
    .map(
      (route) =>
        `  ${route.path}\n    id: ${route.id}\n    auth: ${route.auth}\n    entry: ${route.entry}`,
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
