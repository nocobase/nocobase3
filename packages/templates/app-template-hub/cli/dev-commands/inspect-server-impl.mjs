import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function inspectAppServer({
  appRoot = path.resolve(import.meta.dirname, '..', '..'),
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
