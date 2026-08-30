import { Args, Command, Flags } from '@oclif/core';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import {
  createClientPluginsEditor,
  readClientPlugins,
} from '../../../lib/client-plugins.ts';
import { installedPluginDirectory } from '../../../lib/plugin-install.ts';
import {
  hasClientPluginEntry,
  hasServerPluginEntry,
  pluginPackageName,
} from '../../../lib/plugin-registration.ts';
import {
  classifyPluginError,
  pluginJsonFailure,
  pluginJsonSuccess,
} from '../../../lib/plugin-json.ts';
import {
  createServerPluginsEditor,
  readServerPlugins,
} from '../../../lib/server-plugins.ts';
import { collectPluginSkills } from '../../../lib/skills-sync.ts';
import { resolveAppRoot } from '../../../lib/workspace-app.ts';

interface InspectIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

interface InspectSuggestion {
  readonly command: string;
  readonly args: readonly string[];
}

export default class AppPluginInspect extends Command {
  static override summary = "Inspect a plugin's static registration state.";
  static override description =
    'Reads the installed package, dependency and metadata records, Client and Server composition roots, and synchronized Skills without modifying the App.';
  static override examples = [
    '<%= config.bin %> <%= command.id %> audit-log --json',
    '<%= config.bin %> <%= command.id %> audit-log --workspace-root . --app app-template-default --json',
  ];
  static override args = {
    name: Args.string({
      description: 'Plugin short name or full @nocobase/app-plugin-* name.',
      required: true,
    }),
  };
  static override flags = {
    dir: Flags.string({
      description: 'App directory. Defaults to the current directory.',
    }),
    app: Flags.string({
      description:
        'Workspace app directory or package name. Requires --workspace-root.',
    }),
    'workspace-root': Flags.string({
      description:
        'Monorepo root. Selects app-template-default unless --app is provided.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print one machine-readable JSON result.',
    }),
  };

  public async run(): Promise<void> {
    try {
      const { args, flags } = await this.parse(AppPluginInspect);
      const appRoot = await resolveAppRoot({
        app: flags.app,
        dir: flags.dir,
        workspaceRoot: flags['workspace-root'],
      });
      const packageName = pluginPackageName(args.name);
      const result = await inspectPlugin(appRoot, packageName);
      const response = pluginJsonSuccess('plugin:inspect', 'success', result);
      if (flags.json) {
        this.logJson(response);
      } else {
        this.log(
          `${packageName}: ${result.issues.length === 0 ? 'registration state is consistent' : `${result.issues.length} issue(s) found`}`,
        );
        for (const issue of result.issues) {
          this.log(`  ${issue.severity}: ${issue.message}`);
        }
      }
    } catch (error) {
      if (!this.argv.includes('--json')) throw error;
      this.logToStderr(
        JSON.stringify(
          pluginJsonFailure('plugin:inspect', classifyPluginError(error)),
          null,
          2,
        ),
      );
      process.exitCode = 1;
    }
  }
}

async function inspectPlugin(
  appRoot: string,
  packageName: string,
): Promise<Record<string, unknown> & { issues: InspectIssue[] }> {
  const manifest = JSON.parse(
    await readFile(path.join(appRoot, 'package.json'), 'utf8'),
  ) as {
    name?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    nocobase?: { plugins?: Record<string, { enabled?: boolean }> };
  };
  const pluginDirectory = await installedPluginDirectory(appRoot, packageName);
  const dependencyField = manifest.dependencies?.[packageName]
    ? 'dependencies'
    : manifest.devDependencies?.[packageName]
      ? 'devDependencies'
      : undefined;
  const dependencyRange =
    manifest.dependencies?.[packageName] ??
    manifest.devDependencies?.[packageName];
  const registration = manifest.nocobase?.plugins?.[packageName];
  const enabled = registration?.enabled === true;
  const clientExport = pluginDirectory
    ? await hasClientPluginEntry(pluginDirectory)
    : false;
  const serverExport = pluginDirectory
    ? await hasServerPluginEntry(pluginDirectory)
    : false;
  const issues: InspectIssue[] = [];

  if (!pluginDirectory)
    issues.push({
      code: 'PLUGIN_NOT_INSTALLED',
      message: `${packageName} is not installed in the App.`,
      severity: 'error',
    });
  if (!dependencyRange)
    issues.push({
      code: 'DEPENDENCY_MISSING',
      message: `${packageName} is not declared as an App dependency.`,
      severity: 'error',
    });
  if (!registration)
    issues.push({
      code: 'PLUGIN_METADATA_MISSING',
      message: `${packageName} is absent from nocobase.plugins.`,
      severity: 'error',
    });

  const client = await inspectComposition(appRoot, packageName, 'client');
  const server = await inspectComposition(appRoot, packageName, 'server');
  const expectedClient = enabled && clientExport;
  const expectedServer = enabled && serverExport;
  if (client.registered !== expectedClient)
    issues.push({
      code: expectedClient ? 'CLIENT_ENTRY_MISSING' : 'CLIENT_ENTRY_UNEXPECTED',
      message: `client/plugins.ts is ${client.registered ? '' : 'not '}registered, expected ${expectedClient}.`,
      severity: 'error',
    });
  if (server.registered !== expectedServer)
    issues.push({
      code: expectedServer ? 'SERVER_ENTRY_MISSING' : 'SERVER_ENTRY_UNEXPECTED',
      message: `server/plugins.ts is ${server.registered ? '' : 'not '}registered, expected ${expectedServer}.`,
      severity: 'error',
    });

  const skills = pluginDirectory
    ? await inspectSkills(appRoot, packageName, pluginDirectory)
    : {
        checked: false,
        reason: 'plugin-not-installed',
        source: [],
        synchronized: [],
        missing: [],
        stale: [],
        contentMatches: false,
      };
  if (
    skills.checked &&
    (skills.missing.length > 0 ||
      skills.stale.length > 0 ||
      !skills.contentMatches)
  )
    issues.push({
      code: 'SKILLS_OUT_OF_DATE',
      message: `Synchronized Skills do not match ${packageName}.`,
      severity: 'warning',
    });

  return {
    app: { packageName: manifest.name ?? appRoot, appRoot },
    plugin: {
      packageName,
      installed: pluginDirectory !== undefined,
      pluginDirectory,
      exports: { client: clientExport, serverPlugin: serverExport },
    },
    dependency: { field: dependencyField, range: dependencyRange },
    metadata: { registered: registration !== undefined, enabled },
    composition: {
      client: { expected: expectedClient, ...client },
      server: { expected: expectedServer, ...server },
    },
    skills,
    consistent: issues.length === 0,
    issues,
    suggestions: suggestionsFor(issues, packageName),
  };
}

async function inspectComposition(
  appRoot: string,
  packageName: string,
  kind: 'client' | 'server',
): Promise<{ registered: boolean; order?: number }> {
  const file =
    kind === 'client'
      ? await readClientPlugins(appRoot)
      : await readServerPlugins(appRoot);
  if (!file.exists) return { registered: false };
  const editor =
    kind === 'client'
      ? await createClientPluginsEditor(appRoot)
      : await createServerPluginsEditor(appRoot);
  const entries = editor.list(file.sourceText);
  const order = entries.findIndex((entry) => entry.packageName === packageName);
  return order === -1
    ? { registered: false }
    : { registered: true, order: order + 1 };
}

async function inspectSkills(
  appRoot: string,
  packageName: string,
  pluginDirectory: string,
): Promise<
  Record<string, unknown> & {
    checked: true;
    missing: string[];
    stale: string[];
    contentMatches: boolean;
  }
> {
  const source = await collectPluginSkills({ packageName, pluginDirectory });
  const targetRoot = path.join(appRoot, '.agents', 'skills');
  const synchronized = await safeDirectoryNames(targetRoot);
  const owned = synchronized.filter(
    (name) => name === source.prefix || name.startsWith(`${source.prefix}-`),
  );
  const sourceNames = source.skills.map((skill) => skill.name);
  const missing = sourceNames.filter((name) => !owned.includes(name));
  const stale = owned.filter((name) => !sourceNames.includes(name));
  let contentMatches = missing.length === 0 && stale.length === 0;
  if (contentMatches) {
    for (const skill of source.skills) {
      if (
        (await hashDirectory(skill.sourcePath)) !==
        (await hashDirectory(path.join(targetRoot, skill.name)))
      ) {
        contentMatches = false;
        break;
      }
    }
  }
  return {
    checked: true,
    source: sourceNames,
    synchronized: owned,
    missing,
    stale,
    contentMatches,
  };
}

async function safeDirectoryNames(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return [];
    throw error;
  }
}

async function hashDirectory(directory: string): Promise<string> {
  const hash = createHash('sha256');
  const visit = async (current: string, relative = ''): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const childRelative = path.join(relative, entry.name);
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(child, childRelative);
      else if (entry.isFile()) {
        hash.update(childRelative);
        hash.update(await readFile(child));
      }
    }
  };
  await visit(directory);
  return hash.digest('hex');
}

function suggestionFor(code: string, packageName: string): InspectSuggestion {
  const shortName = packageName.replace('@nocobase/app-plugin-', '');
  if (code === 'PLUGIN_NOT_INSTALLED')
    return {
      command: 'pnpm',
      args: ['plugin:register', shortName],
    };
  if (code === 'SKILLS_OUT_OF_DATE')
    return {
      command: 'pnpm',
      args: ['plugin:skills:sync', '--plugin', shortName],
    };
  return {
    command: 'pnpm',
    args: ['plugin:register', shortName, '--no-install'],
  };
}

function suggestionsFor(
  issues: readonly InspectIssue[],
  packageName: string,
): InspectSuggestion[] {
  const notInstalled = issues.find(
    ({ code }) => code === 'PLUGIN_NOT_INSTALLED',
  );
  const actionableIssues = notInstalled ? [notInstalled] : issues;
  return uniqueSuggestions(
    actionableIssues.map((issue) => suggestionFor(issue.code, packageName)),
  );
}

function uniqueSuggestions(
  suggestions: readonly InspectSuggestion[],
): InspectSuggestion[] {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = JSON.stringify([suggestion.command, suggestion.args]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
