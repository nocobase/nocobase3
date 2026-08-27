// Copies the skills a plugin ships into the application that registered it.
//
// Upstream is the single source of truth: every synchronized directory is
// replaced wholesale, and a directory whose name does not start with
// `nocobase-` is never touched, so an application can keep its own skills
// alongside the synchronized ones.
//
// Where the plugins live differs by caller. Inside this repository they sit
// under `packages/`; in a generated application they are installed into
// `node_modules`. Everything except that lookup is shared, so the lookup is a
// parameter rather than a branch.
import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const PACKAGE_SCOPE = '@nocobase/';
const KEBAB_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** Directory, relative to a package root, that holds agent skills. */
export const SKILLS_DIRECTORY: string = path.join('.agents', 'skills');

/** Every synchronized skill directory starts with this prefix. */
export const SKILL_NAME_PREFIX = 'nocobase-';

export interface PluginLocation {
  readonly packageName: string;
  readonly pluginDirectory: string;
}

export interface PluginSkills extends PluginLocation {
  readonly prefix: string;
  readonly skills: readonly SkillSource[];
  readonly skillsDirectory: string;
}

export interface SkillSource {
  readonly name: string;
  readonly packageName: string;
  readonly sourcePath: string;
}

export interface SkillCopy {
  readonly files: readonly string[];
  readonly packageName: string;
  readonly skillName: string;
  readonly sourcePath: string;
  readonly targetPath: string;
}

export interface SkillRemoval {
  readonly files: readonly string[];
  readonly packageName: string;
  readonly skillName: string;
  readonly targetPath: string;
}

export interface SkillsSyncPlan {
  readonly appPackageName: string;
  readonly appRoot: string;
  readonly copies: readonly SkillCopy[];
  readonly dryRun?: boolean;
  readonly plugins: readonly {
    readonly packageName: string;
    readonly pluginDirectory: string;
    readonly prefix: string;
    readonly skills: readonly string[];
  }[];
  readonly removals: readonly SkillRemoval[];
  readonly skillsRoot: string;
}

/**
 * The skill directory prefix a plugin package owns. The prefix is the package
 * name without its scope, so `@nocobase/app-plugin-workflow` owns
 * `nocobase-app-plugin-workflow` and `nocobase-app-plugin-workflow-<suffix>`.
 */
export function pluginSkillPrefix(packageName: string): string {
  if (!packageName.startsWith(PACKAGE_SCOPE)) {
    throw new Error(
      `Plugin package name must start with ${PACKAGE_SCOPE}, found ${packageName}.`,
    );
  }
  const unscopedName = packageName.slice(PACKAGE_SCOPE.length);
  if (!KEBAB_PATTERN.test(unscopedName)) {
    throw new Error(
      `Plugin package name cannot be turned into a skill prefix: ${packageName}.`,
    );
  }
  return `${SKILL_NAME_PREFIX}${unscopedName}`;
}

/** Whether a skill directory name belongs to the plugin owning `prefix`. */
export function isOwnedSkillName(prefix: string, skillName: string): boolean {
  return skillName === prefix || skillName.startsWith(`${prefix}-`);
}

/**
 * The first-level skill directories a plugin ships, with their names validated.
 * A plugin without `.agents/skills/` yields an empty list: most plugins ship no
 * skills and must not produce warnings.
 */
export async function collectPluginSkills({
  packageName,
  pluginDirectory,
}: PluginLocation): Promise<PluginSkills> {
  const skillsDirectory = path.join(pluginDirectory, SKILLS_DIRECTORY);
  const prefix = pluginSkillPrefix(packageName);
  const entries = await readDirectoryEntries(skillsDirectory);

  const skills: SkillSource[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (
      !KEBAB_PATTERN.test(entry.name) ||
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
 * The full-overwrite plan: which upstream skill directories to copy in, and
 * which app-side directories owned by these plugins no longer exist upstream.
 */
export async function planSkillsSync({
  appPackageName,
  appRoot,
  plugins,
}: {
  appPackageName: string;
  appRoot: string;
  plugins: readonly PluginLocation[];
}): Promise<SkillsSyncPlan> {
  const skillsRoot = path.join(appRoot, SKILLS_DIRECTORY);
  const sources: PluginSkills[] = [];
  for (const plugin of plugins) {
    sources.push(await collectPluginSkills(plugin));
  }

  const owners = new Map<string, string>();
  const copies: SkillCopy[] = [];
  for (const source of sources) {
    for (const skill of source.skills) {
      const previousOwner = owners.get(skill.name);
      if (previousOwner !== undefined) {
        throw new Error(
          `Skill name collision: ${skill.name} is provided by both ${previousOwner} and ${skill.packageName}.`,
        );
      }
      owners.set(skill.name, skill.packageName);
      copies.push({
        files: await listFiles(skill.sourcePath),
        packageName: skill.packageName,
        skillName: skill.name,
        sourcePath: skill.sourcePath,
        targetPath: path.join(skillsRoot, skill.name),
      });
    }
  }

  const removals: SkillRemoval[] = [];
  for (const entry of await readDirectoryEntries(skillsRoot)) {
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

/** Executes a plan. Upstream wins: every target directory is replaced wholesale. */
export async function applySkillsSync(
  plan: SkillsSyncPlan,
): Promise<SkillsSyncPlan> {
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
 * Locates registered plugins in a generated application, where they are
 * installed dependencies rather than workspace directories.
 */
export async function resolveInstalledPlugins({
  appRoot,
  plugin,
}: {
  appRoot: string;
  plugin?: string;
}): Promise<{
  appPackageName: string;
  appRoot: string;
  plugins: PluginLocation[];
}> {
  const packageJsonPath = path.join(appRoot, 'package.json');
  const applicationPackage = await readJson(packageJsonPath);
  const appPackageName =
    typeof applicationPackage.name === 'string'
      ? applicationPackage.name
      : appRoot;
  const packageNames =
    plugin === undefined
      ? readRegisteredPluginNames(applicationPackage, packageJsonPath)
      : [normalizePluginPackageName(plugin)];

  const plugins: PluginLocation[] = [];
  for (const packageName of packageNames) {
    const pluginDirectory = path.join(appRoot, 'node_modules', packageName);
    if (await isPackageDirectory(pluginDirectory, packageName)) {
      plugins.push({ packageName, pluginDirectory });
      continue;
    }
    throw new Error(
      `Plugin package ${packageName} is not installed in ${appRoot}. Run the package manager install first.`,
    );
  }
  return { appPackageName, appRoot, plugins };
}

/** Renders a human-readable summary of a plan or result. */
export function formatSkillsSyncSummary(
  plan: SkillsSyncPlan,
  { verbose = false }: { verbose?: boolean } = {},
): string {
  if (plan.copies.length === 0 && plan.removals.length === 0) {
    return `No plugin skills to synchronize for ${plan.appPackageName}.`;
  }

  const lines: string[] = [
    `${plan.dryRun ? 'Would synchronize' : 'Synchronized'} plugin skills for ${plan.appPackageName}`,
  ];
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

function normalizePluginPackageName(name: string): string {
  const trimmed = name.trim();
  return trimmed.startsWith(PACKAGE_SCOPE)
    ? trimmed
    : `${PACKAGE_SCOPE}app-plugin-${trimmed}`;
}

function readRegisteredPluginNames(
  applicationPackage: Record<string, unknown>,
  packageJsonPath: string,
): string[] {
  const nocobase = applicationPackage.nocobase;
  if (nocobase === undefined) {
    return [];
  }
  if (!isRecord(nocobase)) {
    throw new Error(`${packageJsonPath} must define nocobase as an object.`);
  }
  const plugins = nocobase.plugins;
  if (plugins === undefined) {
    return [];
  }
  if (!isRecord(plugins)) {
    throw new Error(
      `${packageJsonPath} must define nocobase.plugins as an object.`,
    );
  }
  return Object.keys(plugins).sort();
}

/**
 * Picks the plugin owning an app-side skill directory. The longest matching
 * prefix wins, so `nocobase-app-plugin-notification-provider` belongs to
 * `app-plugin-notification-provider` rather than reading as a suffixed skill of
 * `app-plugin-notification`.
 */
function findOwningPlugin(
  sources: readonly PluginSkills[],
  skillName: string,
): PluginSkills | undefined {
  let owner: PluginSkills | undefined;
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

async function isPackageDirectory(
  directory: string,
  packageName: string,
): Promise<boolean> {
  try {
    const manifest = await readJson(path.join(directory, 'package.json'));
    return manifest.name === packageName;
  } catch {
    return false;
  }
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  const contents = await readFile(filePath, 'utf8');
  try {
    return JSON.parse(contents) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}.`, { cause: error });
  }
}

async function readDirectoryEntries(
  directory: string,
): Promise<{ name: string; isDirectory: () => boolean }[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return [...entries].sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
  } catch (error) {
    if (isNodeError(error, 'ENOENT') || isNodeError(error, 'ENOTDIR')) {
      return [];
    }
    throw error;
  }
}

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (directory: string, prefix: string): Promise<void> => {
    for (const entry of await readDirectoryEntries(directory)) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    (error as { code?: string }).code === code
  );
}
