// Monorepo entry for plugin skills synchronization.
//
// The synchronization itself lives in `@nocobase/nb3-cli` so that this
// repository and a generated application run the same code. Only the lookup
// differs and stays here: in the workspace a plugin is a directory under
// `packages/`, while in a generated application it is an installed dependency.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SKILLS_DIRECTORY,
  SKILL_NAME_PREFIX,
  applySkillsSync,
  collectPluginSkills,
  formatSkillsSyncSummary,
  isOwnedSkillName,
  planSkillsSync,
  pluginSkillPrefix,
} from '../../packages/cli/src/lib/skills-sync.ts';

import { normalizePluginName } from '../create-plugin.mjs';
import { DEFAULT_APP, resolveApplication } from '../register-plugin.mjs';
import { readFile, readdir } from 'node:fs/promises';

export {
  DEFAULT_APP,
  SKILLS_DIRECTORY,
  SKILL_NAME_PREFIX,
  applySkillsSync,
  collectPluginSkills,
  formatSkillsSyncSummary,
  isOwnedSkillName,
  planSkillsSync,
  pluginSkillPrefix,
};

const packageScope = '@nocobase/';
const pluginPackagePrefix = `${packageScope}app-plugin-`;
const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), '..', '..');

/**
 * Resolve which plugins to synchronize from the monorepo workspace. `plugin` limits the run to one plugin; without it
 * every plugin registered under the application's `nocobase.plugins` is synchronized.
 */
export async function resolveWorkspacePlugins({
  app = DEFAULT_APP,
  plugin,
  repoRoot = defaultRepoRoot,
} = {}) {
  const resolvedRepoRoot = path.resolve(repoRoot);
  const application = await resolveApplication(resolvedRepoRoot, app);
  const packageNames =
    plugin === undefined
      ? await readRegisteredPluginNames(application.packageJsonPath)
      : [`${pluginPackagePrefix}${normalizePluginName(plugin)}`];

  const plugins = [];
  for (const packageName of packageNames) {
    plugins.push({
      packageName,
      pluginDirectory: await resolvePluginDirectory(
        resolvedRepoRoot,
        packageName,
      ),
    });
  }

  return {
    appPackageName: application.packageName,
    appRoot: path.dirname(application.packageJsonPath),
    plugins,
    repoRoot: resolvedRepoRoot,
  };
}

/**
 * Synchronize plugin skills into an application. Throws on any inconsistency; callers that must not fail, such as a
 * postinstall hook, should use `trySyncSkills` instead.
 */
export async function syncSkills({
  app = DEFAULT_APP,
  dryRun = false,
  plugin,
  repoRoot = defaultRepoRoot,
  resolvePlugins = resolveWorkspacePlugins,
} = {}) {
  const resolved = await resolvePlugins({ app, plugin, repoRoot });
  const plan = await planSkillsSync({
    appPackageName: resolved.appPackageName,
    appRoot: resolved.appRoot,
    plugins: resolved.plugins,
  });

  if (dryRun) {
    return { ...plan, dryRun: true };
  }
  await applySkillsSync(plan);
  return { ...plan, dryRun: false };
}

/**
 * Run `syncSkills` and downgrade any failure to a warning. Skill synchronization copies documentation, so it must
 * never break the command that triggered it.
 */
export async function trySyncSkills({ onWarning = warn, ...options } = {}) {
  try {
    return {
      error: undefined,
      result: await syncSkills(options),
      succeeded: true,
      warning: undefined,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const warning = `Skipped plugin skills synchronization: ${reason}`;
    onWarning(warning, error);
    return { error, result: undefined, succeeded: false, warning };
  }
}

async function readRegisteredPluginNames(packageJsonPath) {
  const contents = await readFile(packageJsonPath, 'utf8');
  let applicationPackage;
  try {
    applicationPackage = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Invalid JSON in ${packageJsonPath}.`, { cause: error });
  }
  const nocobase = applicationPackage?.nocobase;
  if (nocobase === undefined) {
    return [];
  }
  if (!isRecord(nocobase)) {
    throw new Error(`${packageJsonPath} must define nocobase as an object.`);
  }
  if (nocobase.plugins === undefined) {
    return [];
  }
  if (!isRecord(nocobase.plugins)) {
    throw new Error(
      `${packageJsonPath} must define nocobase.plugins as an object.`,
    );
  }
  return Object.keys(nocobase.plugins).sort();
}

async function resolvePluginDirectory(repoRoot, packageName) {
  const packagesRoot = path.join(repoRoot, 'packages');
  const unscopedName = packageName.startsWith('@')
    ? packageName.slice(packageName.indexOf('/') + 1)
    : packageName;

  const preferred = path.join(packagesRoot, unscopedName);
  if (await isPackageDirectory(preferred, packageName)) {
    return preferred;
  }

  for (const entry of sortByName(await readDirectoryEntries(packagesRoot))) {
    if (!entry.isDirectory()) {
      continue;
    }
    const candidate = path.join(packagesRoot, entry.name);
    if (await isPackageDirectory(candidate, packageName)) {
      return candidate;
    }
  }

  throw new Error(
    `Plugin package ${packageName} was not found under ${packagesRoot}. Remove it from the application registry or restore the package.`,
  );
}

async function isPackageDirectory(directory, packageName) {
  let contents;
  try {
    contents = await readFile(path.join(directory, 'package.json'), 'utf8');
  } catch (error) {
    if (isNodeError(error, 'ENOENT') || isNodeError(error, 'ENOTDIR')) {
      return false;
    }
    throw error;
  }
  try {
    return JSON.parse(contents)?.name === packageName;
  } catch {
    return false;
  }
}

async function readDirectoryEntries(directory) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error, 'ENOENT') || isNodeError(error, 'ENOTDIR')) {
      return [];
    }
    throw error;
  }
}

function sortByName(entries) {
  return [...entries].sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
}

function warn(message) {
  console.warn(message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNodeError(error, code) {
  return error !== null && typeof error === 'object' && error.code === code;
}
