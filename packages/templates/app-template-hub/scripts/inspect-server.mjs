import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const help = `Inspect this App's imported Server plugin declarations.

Importing server/plugins.ts executes module initialization, so declaration
modules must not start runtime services. The command does not construct
Providers, run lifecycle code, execute Route factories, load locale resources,
connect to a database, start workers, or load Queue Job modules.

Usage:
  pnpm server:inspect [options]

Options:
  --json       Print one machine-readable JSON document
  -h, --help   Show this help`;

export function parseInspectAppServerArgs(args) {
  const options = { help: false, json: false };
  for (const argument of args) {
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--json') options.json = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

export async function inspectAppServer({
  appRoot = path.resolve(import.meta.dirname, '..'),
} = {}) {
  const entry = ['ts', 'js']
    .map((extension) => path.join(appRoot, `server/plugins.${extension}`))
    .find((candidate) => existsSync(candidate));
  if (!entry) {
    throw new Error(
      `Application at ${appRoot} does not declare server/plugins.ts.`,
    );
  }

  const { inspectResolvedAppServerPlugins, resolveAppServerPlugins } =
    await import('@nocobase/app-server/plugins');
  let plugins;
  try {
    const loaded = await import(pathToFileURL(entry).href);
    plugins = loaded.default;
    if (!plugins || !Array.isArray(plugins.plugins)) {
      throw new Error(
        'the default export must come from defineServerPlugins()',
      );
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to inspect server/plugins.ts: ${reason}`, {
      cause: error,
    });
  }

  return inspectResolvedAppServerPlugins(
    resolveAppServerPlugins(appRoot, plugins),
  );
}

export function formatAppServerInspection(inspection) {
  const lines = [
    `Server plugin declarations for ${inspection.app.packageName}`,
    '',
  ];
  for (const plugin of inspection.plugins) {
    const routeScopes = inspection.routes
      .filter(({ packageName }) => packageName === plugin.packageName)
      .map(({ scope }) => scope);
    const database = inspection.database.find(
      ({ packageName }) => packageName === plugin.packageName,
    );
    const databaseContributions = [
      database?.migrations ? 'migrations' : undefined,
      database?.seeds ? 'seeds' : undefined,
    ].filter(Boolean);
    lines.push(
      `${plugin.order}. ${plugin.packageName}@${plugin.version}`,
      `   service providers: ${plugin.contributions.serviceProviders}`,
      `   routes: ${routeScopes.length > 0 ? routeScopes.join(', ') : 'none'}`,
      `   locales: ${plugin.contributions.locales ? 'declared' : 'none'}`,
    );
    if (databaseContributions.length > 0) {
      lines.push(`   database: ${databaseContributions.join(', ')}`);
    }
    if (plugin.contributions.jobLocations > 0) {
      lines.push(`   jobs: ${plugin.contributions.jobLocations}`);
    }
    lines.push('');
  }
  if (inspection.issues.length === 0) {
    lines.push('Issues: none');
  } else {
    lines.push(`Issues: ${inspection.issues.length}`);
    for (const issue of inspection.issues) {
      lines.push(`- ${issue.code}: ${issue.message}`);
    }
  }
  if (inspection.suggestions.length > 0) {
    lines.push('', 'Suggestions:');
    for (const suggestion of inspection.suggestions) {
      lines.push(`- ${suggestion}`);
    }
  }
  lines.push(
    '',
    'Inspection scope: declarations and resolved contribution locations only.',
    'Runtime Provider, Route, locale, database, and Job behavior is not inspected.',
  );
  return lines.join('\n');
}

async function main() {
  const jsonRequested = process.argv.slice(2).includes('--json');
  try {
    const options = parseInspectAppServerArgs(process.argv.slice(2));
    if (options.help) {
      console.log(help);
      return;
    }
    const result = await inspectAppServer();
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            schemaVersion: 1,
            ok: true,
            operation: 'server:inspect',
            status: 'success',
            result,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(formatAppServerInspection(result));
    }
  } catch (error) {
    if (!jsonRequested) throw error;
    console.error(
      JSON.stringify(
        {
          schemaVersion: 1,
          ok: false,
          operation: 'server:inspect',
          status: 'failure',
          error: {
            code: 'SERVER_INSPECTION_FAILED',
            message: error instanceof Error ? error.message : String(error),
            suggestions: [
              'Check server/plugins.ts and ensure every registered plugin package can be resolved.',
            ],
          },
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === path.resolve(import.meta.filename)) await main();
