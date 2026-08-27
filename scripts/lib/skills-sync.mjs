import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizePluginName } from '../create-plugin.mjs';
import { DEFAULT_APP, resolveApplication } from '../register-plugin.mjs';

export { DEFAULT_APP };

const packageScope = '@nocobase/';
const pluginPackagePrefix = `${packageScope}app-plugin-`;
const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), '..', '..');
const kebabPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** Directory, relative to a package root, that holds agent skills. */
export const SKILLS_DIRECTORY = path.join('.agents', 'skills');

/** Every synchronized skill directory starts with this prefix. */
export const SKILL_NAME_PREFIX = 'nocobase-';

/**
 * Build the skill directory prefix owned by a plugin package. The prefix is the package name without its scope, so
 * `@nocobase/app-plugin-workflow` owns `nocobase-app-plugin-workflow` and `nocobase-app-plugin-workflow-<suffix>`.
 */
export function pluginSkillPrefix(packageName) {
  if (
    typeof packageName !== 'string' ||
    !packageName.startsWith(packageScope)
  ) {
    throw new Error(
      `Plugin package name must start with ${packageScope}, found ${String(packageName)}.`,
    );
  }
  const unscopedName = packageName.slice(packageScope.length);
  if (!kebabPattern.test(unscopedName)) {
    throw new Error(
      `Plugin package name cannot be turned into a skill prefix: ${packageName}.`,
    );
  }
  return `${SKILL_NAME_PREFIX}${unscopedName}`;
}

/** Whether a skill directory name belongs to the plugin that owns `prefix`. */
export function isOwnedSkillName(prefix, skillName) {
  return skillName === prefix || skillName.startsWith(`${prefix}-`);
}

/**
 * Read the first-level skill directories a plugin ships and validate their names. A plugin without
 * `.agents/skills/` yields an empty list: most plugins ship no skills and must not produce warnings.
 */
export async function collectPluginSkills({ packageName, pluginDirectory }) {
  const skillsDirectory = path.join(pluginDirectory, SKILLS_DIRECTORY);
  const prefix = pluginSkillPrefix(packageName);
  let entries;
  try {
    entries = await readdir(skillsDirectory, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error, 'ENOENT') || isNodeError(error, 'ENOTDIR')) {
      return {
        packageName,
        pluginDirectory,
        prefix,
        skills: [],
        skillsDirectory,
      };
    }
    throw error;
  }

  const skills = [];
  for (const entry of sortByName(entries)) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (
      !kebabPattern.test(entry.name) ||
      !isOwnedSkillName(prefix, entry.name)
    ) {
      throw new Error(
        `Invalid skill directory ${entry.name} in ${skillsDirectory}: skills of ${packageName} must be named ${prefix} or ${prefix}-<suffix>.`,
      );
    }
    skills.push({
      name: entry.name,
      packageName,
      sourcePath: path.join(skillsDirectory, entry.name),
    });
  }
  return { packageName, pluginDirectory, prefix, skills, skillsDirectory };
}

/**
 * Compute the full-overwrite plan for an application: which upstream skill directories to copy in, and which
 * app-side directories owned by the given plugins no longer exist upstream and must go.
 */
export async function planSkillsSync({ appPackageName, appRoot, plugins }) {
  const skillsRoot = path.join(appRoot, SKILLS_DIRECTORY);
  const sources = [];
  for (const plugin of plugins) {
    sources.push(await collectPluginSkills(plugin));
  }

  const owners = new Map();
  const copies = [];
  for (const source of sources) {
    for (const skill of source.skills) {
      const previousOwner = owners.get(skill.name);
      if (previousOwner !== undefined) {
        throw new Error(
          `Skill name collision: ${skill.name} is provided by both ${previousOwner} and ${skill.packageName}.`,
        );
      }
      owners.set(skill.name, skill.packageName);
      const targetPath = path.join(skillsRoot, skill.name);
      copies.push({
        files: await listFiles(skill.sourcePath),
        packageName: skill.packageName,
        skillName: skill.name,
        sourcePath: skill.sourcePath,
        targetPath,
      });
    }
  }

  const removals = [];
  for (const entry of sortByName(await readDirectoryEntries(skillsRoot))) {
    if (!entry.isDirectory() || !entry.name.startsWith(SKILL_NAME_PREFIX)) {
      continue;
    }
    if (owners.has(entry.name)) {
      continue;
    }
    const owner = findOwningPlugin(sources, entry.name);
    if (owner === undefined) {
      continue;
    }
    const targetPath = path.join(skillsRoot, entry.name);
    removals.push({
      files: await listFiles(targetPath),
      packageName: owner.packageName,
      skillName: entry.name,
      targetPath,
    });
  }

  return {
    appPackageName,
    appRoot,
    copies,
    plugins: sources.map(
      ({ packageName, pluginDirectory, prefix, skills }) => ({
        packageName,
        pluginDirectory,
        prefix,
        skills: skills.map(({ name }) => name),
      }),
    ),
    removals,
    skillsRoot,
  };
}

/** Execute a plan produced by `planSkillsSync`. Upstream wins: every target directory is replaced wholesale. */
export async function applySkillsSync(plan) {
  for (const removal of plan.removals) {
    await rm(removal.targetPath, { force: true, recursive: true });
  }
  if (plan.copies.length > 0) {
    await mkdir(plan.skillsRoot, { recursive: true });
  }
  for (const copy of plan.copies) {
    await rm(copy.targetPath, { force: true, recursive: true });
    await cp(copy.sourcePath, copy.targetPath, { recursive: true });
  }
  return plan;
}

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

/** Render a human-readable summary of a synchronization result or plan. */
export function formatSkillsSyncSummary(plan, { verbose = false } = {}) {
  const lines = [];
  const headline = plan.dryRun ? 'Would synchronize' : 'Synchronized';
  if (plan.copies.length === 0 && plan.removals.length === 0) {
    return `No plugin skills to synchronize for ${plan.appPackageName}.`;
  }

  lines.push(`${headline} plugin skills for ${plan.appPackageName}`);
  for (const copy of plan.copies) {
    lines.push(`  copy ${copy.skillName} (${copy.packageName})`);
    if (verbose || plan.dryRun) {
      for (const file of copy.files) {
        lines.push(`    + ${file}`);
      }
    }
  }
  for (const removal of plan.removals) {
    lines.push(
      `  remove ${removal.skillName} (no longer provided by ${removal.packageName})`,
    );
    if (verbose || plan.dryRun) {
      for (const file of removal.files) {
        lines.push(`    - ${file}`);
      }
    }
  }
  return lines.join('\n');
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

/**
 * Pick the plugin that owns an app-side skill directory. The longest matching prefix wins so that
 * `nocobase-app-plugin-notification-provider` belongs to `app-plugin-notification-provider` rather than being read as
 * a suffixed skill of `app-plugin-notification`.
 */
function findOwningPlugin(sources, skillName) {
  let owner;
  for (const source of sources) {
    if (!isOwnedSkillName(source.prefix, skillName)) {
      continue;
    }
    if (owner === undefined || source.prefix.length > owner.prefix.length) {
      owner = source;
    }
  }
  return owner;
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

async function listFiles(root) {
  const files = [];
  const walk = async (directory, prefix) => {
    for (const entry of sortByName(
      await readdir(directory, { withFileTypes: true }),
    )) {
      const relativePath =
        prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(path.join(directory, entry.name), relativePath);
        continue;
      }
      files.push(relativePath);
    }
  };
  await walk(root, '');
  return files;
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
