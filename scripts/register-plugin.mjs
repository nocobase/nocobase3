import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import {
  access,
  lstat,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizePluginName } from './create-plugin.mjs';
import {
  addClientPlugin,
  clientPluginsPath,
  formatClientPlugins,
  readClientPlugins,
  writeClientPlugins,
} from './lib/client-plugins.mjs';
import { hasClientPluginEntry } from '../packages/cli/src/lib/plugin-registration.ts';
import { trySyncSkills } from './lib/skills-sync.mjs';

const packagePrefix = '@nocobase/app-plugin-';
const directoryPrefix = 'app-plugin-';
export const DEFAULT_APP = 'app-template-default';
const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), '..');
const skippedDirectoryNames = new Set([
  '.git',
  '.pnpm',
  'build',
  'coverage',
  'dist',
  'node_modules',
]);

const help = `Register an existing NocoBase plugin in an application package.

Usage:
  pnpm plugin:register <name> [options]

Arguments:
  <name>            Short kebab-case name, for example audit-log
                    (full @nocobase/app-plugin-* names also work)

Options:
  --app <app>       Application directory or package name
                    (default: app-template-default)
  --disabled        Register the plugin with enabled set to false
  --no-install      Do not synchronize pnpm-lock.yaml
  --no-skills       Do not synchronize the plugin's skills into the application
  --dry-run         Validate and print the change without writing
  -h, --help        Show this help

Examples:
  pnpm plugin:register audit-log
  pnpm plugin:register audit-log --app app-template-default
  pnpm plugin:register audit-log --app @nocobase/app-template-default
  pnpm plugin:register audit-log --app app-template-default --disabled`;

export function parseRegisterPluginArgs(args) {
  const options = {
    app: DEFAULT_APP,
    dryRun: false,
    enabled: true,
    help: false,
    install: true,
    name: undefined,
    skills: true,
  };
  const positionals = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (argument === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (argument === '--disabled') {
      options.enabled = false;
      continue;
    }
    if (argument === '--no-install') {
      options.install = false;
      continue;
    }
    if (argument === '--no-skills') {
      options.skills = false;
      continue;
    }
    if (argument === '--app') {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('-')) {
        throw new Error('--app requires a value.');
      }
      options.app = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    }
    positionals.push(argument);
  }

  if (positionals.length > 1) {
    throw new Error('Expected exactly one plugin name.');
  }
  options.name = positionals[0];

  if (!options.help && options.name === undefined) {
    throw new Error('A plugin name is required.');
  }

  return options;
}

export async function registerPlugin({
  app = DEFAULT_APP,
  dryRun = false,
  enabled = true,
  install = true,
  name,
  skills = true,
  repoRoot = defaultRepoRoot,
  synchronize = synchronizeWorkspace,
}) {
  const shortName = normalizePluginName(name);
  const packageName = `${packagePrefix}${shortName}`;
  const resolvedRepoRoot = path.resolve(repoRoot);
  const pluginDirectory = path.join(
    resolvedRepoRoot,
    'packages',
    `${directoryPrefix}${shortName}`,
  );

  await validatePluginPackage(pluginDirectory, packageName);
  const application = await resolveApplication(resolvedRepoRoot, app);
  const originalApplicationContents = await readFile(
    application.packageJsonPath,
    'utf8',
  );
  const applicationPackage = parseJson(
    originalApplicationContents,
    application.packageJsonPath,
  );
  const changed = addPluginRegistration(
    applicationPackage,
    packageName,
    enabled,
    application.packageJsonPath,
  );
  const appRoot = path.dirname(application.packageJsonPath);
  // A disabled registration installs the dependency without wiring the client entry, and a server-only plugin has no
  // client entry to wire; writing an import for one produces an application that fails to resolve at build time. Both
  // cases leave client/plugins.ts untouched.
  const shipsClientEntry = await hasClientPluginEntry(pluginDirectory);
  const skippedClientEntry = !enabled
    ? 'disabled'
    : shipsClientEntry
      ? undefined
      : 'no-client-entry';
  const clientPlugins =
    skippedClientEntry === undefined
      ? await prepareClientPluginEntry(appRoot, packageName)
      : undefined;
  const result = {
    appPackageName: application.packageName,
    appPackagePath: application.packageJsonPath,
    changed: changed || Boolean(clientPlugins?.changed),
    clientPluginsChanged: Boolean(clientPlugins?.changed),
    clientPluginsPath: clientPlugins?.filePath,
    enabled,
    packageName,
    pluginDirectory,
    shortName,
    skippedClientEntry,
  };

  if (dryRun || !result.changed) {
    return result;
  }

  const lockfilePath = path.join(resolvedRepoRoot, 'pnpm-lock.yaml');
  const lockfileSnapshot = install
    ? await readOptionalFile(lockfilePath)
    : undefined;
  const clientPluginsSnapshot = clientPlugins?.changed
    ? await readOptionalFile(clientPlugins.filePath)
    : undefined;
  if (changed) {
    await writeFile(
      application.packageJsonPath,
      `${JSON.stringify(applicationPackage, null, 2)}\n`,
    );
  }
  if (clientPlugins?.changed) {
    await writeClientPlugins(appRoot, clientPlugins.sourceText);
  }

  if (!install) {
    return result;
  }

  try {
    synchronize(resolvedRepoRoot);
  } catch (error) {
    const recoveryErrors = [];
    try {
      await writeFile(application.packageJsonPath, originalApplicationContents);
    } catch (recoveryError) {
      recoveryErrors.push(recoveryError);
    }
    try {
      await restoreOptionalFile(lockfilePath, lockfileSnapshot);
    } catch (recoveryError) {
      recoveryErrors.push(recoveryError);
    }
    if (clientPlugins?.changed) {
      try {
        await restoreOptionalFile(
          clientPlugins.filePath,
          clientPluginsSnapshot,
        );
      } catch (recoveryError) {
        recoveryErrors.push(recoveryError);
      }
    }

    if (recoveryErrors.length > 0) {
      throw new AggregateError(
        [error, ...recoveryErrors],
        `Plugin registration failed and recovery was incomplete for ${application.packageJsonPath}.`,
        { cause: error },
      );
    }

    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Plugin registration failed and ${application.packageJsonPath} was restored: ${reason}`,
      { cause: error },
    );
  }

  // Skills are documentation: a failure here is reported but never fails the
  // registration that already succeeded.
  if (skills) {
    const synced = await trySyncSkills({
      app,
      plugin: shortName,
      repoRoot: resolvedRepoRoot,
    });
    result.skillsSynced = synced.succeeded;
  }

  return result;
}

/**
 * Produces the updated client/plugins.ts text without writing it, so the caller
 * can honour --dry-run and snapshot the file before it changes.
 */
async function prepareClientPluginEntry(appRoot, packageName) {
  const { sourceText } = await readClientPlugins(appRoot);
  const added = addClientPlugin(sourceText, packageName);
  const filePath = clientPluginsPath(appRoot);
  if (!added.changed) {
    return { changed: false, filePath };
  }
  return {
    changed: true,
    filePath,
    sourceText: await formatClientPlugins(added.sourceText, filePath),
  };
}

async function validatePluginPackage(pluginDirectory, packageName) {
  let stats;
  try {
    stats = await lstat(pluginDirectory);
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      throw new Error(`Plugin does not exist: ${pluginDirectory}`, {
        cause: error,
      });
    }
    throw error;
  }

  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(
      `Plugin target must be a real directory: ${pluginDirectory}`,
    );
  }

  const packageJsonPath = path.join(pluginDirectory, 'package.json');
  const pluginPackage = await readJson(packageJsonPath);
  if (pluginPackage.name !== packageName) {
    throw new Error(
      `Plugin package name must be ${packageName}, found ${String(pluginPackage.name)} in ${packageJsonPath}.`,
    );
  }
}

export async function resolveApplication(repoRoot, selector) {
  if (typeof selector !== 'string' || selector.trim().length === 0) {
    throw new Error('--app must be a non-empty application name.');
  }
  const normalizedSelector = selector.trim();
  if (
    normalizedSelector.includes('\\') ||
    (normalizedSelector.includes('/') && !normalizedSelector.startsWith('@'))
  ) {
    throw new Error(
      '--app must be a workspace directory name or a scoped package name, not a path.',
    );
  }

  const candidates = [];
  for (const workspaceRootName of ['packages', 'examples']) {
    const workspaceRoot = path.join(repoRoot, workspaceRootName);
    if (!(await pathExists(workspaceRoot))) {
      continue;
    }
    for (const packageJsonPath of await findPackageJsonFiles(workspaceRoot)) {
      const packageJson = await readJson(packageJsonPath);
      if (
        path.basename(path.dirname(packageJsonPath)) === normalizedSelector ||
        packageJson.name === normalizedSelector
      ) {
        candidates.push({
          packageJsonPath,
          packageName: packageJson.name,
        });
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      `Application package not found for --app ${normalizedSelector}.`,
    );
  }
  if (candidates.length > 1) {
    const matches = candidates
      .map(
        ({ packageJsonPath }) =>
          `  ${path.relative(repoRoot, packageJsonPath)}`,
      )
      .join('\n');
    throw new Error(
      `Application selector ${normalizedSelector} is ambiguous:\n${matches}\nUse the full package name with --app.`,
    );
  }
  if (typeof candidates[0].packageName !== 'string') {
    throw new Error(
      `Application package must define a name: ${candidates[0].packageJsonPath}`,
    );
  }

  return candidates[0];
}

function addPluginRegistration(applicationPackage, packageName, enabled, file) {
  const devDependencies = ensureRecord(
    applicationPackage,
    'devDependencies',
    file,
  );
  const existingDependency = devDependencies[packageName];
  if (
    existingDependency !== undefined &&
    existingDependency !== 'workspace:^'
  ) {
    throw new Error(
      `${file} already declares ${packageName} as ${String(existingDependency)}; refusing to overwrite it.`,
    );
  }

  const nocobase = ensureRecord(applicationPackage, 'nocobase', file);
  const plugins = ensureRecord(nocobase, 'plugins', file);
  const existingRegistration = plugins[packageName];
  if (existingRegistration !== undefined && !isRecord(existingRegistration)) {
    throw new Error(
      `${file} has an invalid nocobase.plugins registration for ${packageName}.`,
    );
  }

  let changed = false;
  if (existingDependency === undefined) {
    insertSorted(devDependencies, packageName, 'workspace:^');
    changed = true;
  }
  if (existingRegistration === undefined) {
    insertSorted(plugins, packageName, { enabled });
    changed = true;
  } else if (existingRegistration.enabled !== enabled) {
    existingRegistration.enabled = enabled;
    changed = true;
  }

  return changed;
}

function ensureRecord(parent, key, file) {
  const value = parent[key];
  if (value === undefined) {
    parent[key] = {};
    return parent[key];
  }
  if (!isRecord(value)) {
    throw new Error(`${file} must define ${key} as an object.`);
  }
  return value;
}

function insertSorted(record, key, value) {
  const entries = Object.entries(record);
  const nextEntryIndex = entries.findIndex(
    ([existingKey]) => existingKey > key,
  );
  if (nextEntryIndex === -1) {
    record[key] = value;
    return;
  }

  const nextEntries = [
    ...entries.slice(0, nextEntryIndex),
    [key, value],
    ...entries.slice(nextEntryIndex),
  ];
  for (const existingKey of Object.keys(record)) {
    delete record[existingKey];
  }
  for (const [entryKey, entryValue] of nextEntries) {
    record[entryKey] = entryValue;
  }
}

async function findPackageJsonFiles(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!skippedDirectoryNames.has(entry.name)) {
        files.push(...(await findPackageJsonFiles(entryPath)));
      }
      continue;
    }
    if (entry.isFile() && entry.name === 'package.json') {
      files.push(entryPath);
    }
  }
  return files;
}

async function readJson(file) {
  let contents;
  try {
    contents = await readFile(file, 'utf8');
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      throw new Error(`Required package.json does not exist: ${file}`, {
        cause: error,
      });
    }
    throw error;
  }
  return parseJson(contents, file);
}

export function parseJson(contents, file) {
  try {
    const value = JSON.parse(contents);
    if (!isRecord(value)) {
      throw new Error('Package JSON root must be an object.');
    }
    return value;
  } catch (error) {
    throw new Error(`Invalid JSON in ${file}.`, { cause: error });
  }
}

export async function readOptionalFile(file) {
  try {
    return await readFile(file);
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      return undefined;
    }
    throw error;
  }
}

export async function restoreOptionalFile(file, snapshot) {
  if (snapshot === undefined) {
    await rm(file, { force: true });
    return;
  }
  await writeFile(file, snapshot);
}

export function synchronizeWorkspace(repoRoot) {
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(pnpm, ['install', '--no-frozen-lockfile'], {
    cwd: repoRoot,
    env: { ...process.env, CI: 'true' },
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`pnpm install failed with exit code ${result.status}.`);
  }
}

async function pathExists(target) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      return false;
    }
    throw error;
  }
}

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNodeError(error, code) {
  return error !== null && typeof error === 'object' && error.code === code;
}

async function main() {
  try {
    const options = parseRegisterPluginArgs(process.argv.slice(2));
    if (options.help) {
      console.log(help);
      return;
    }

    const result = await registerPlugin(options);
    const state = result.enabled ? 'enabled' : 'disabled';
    if (options.dryRun) {
      console.log(
        result.changed
          ? `Would register ${result.packageName} in ${result.appPackageName} as ${state}`
          : `${result.packageName} is already registered in ${result.appPackageName} as ${state}`,
      );
      return;
    }
    if (!result.changed) {
      console.log(
        `${result.packageName} is already registered in ${result.appPackageName} as ${state}`,
      );
      return;
    }

    console.log(
      `Registered ${result.packageName} in ${result.appPackageName} as ${state}`,
    );
    if (result.skippedClientEntry === 'no-client-entry') {
      console.log(
        'Skipped client/plugins.ts: this plugin ships no ./client/plugin export.',
      );
    }
    if (!options.install) {
      console.log(
        'Skipped dependency installation. Run CI=true pnpm install --no-frozen-lockfile before committing.',
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error('Run pnpm plugin:register --help for usage.');
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === scriptPath) {
  await main();
}
