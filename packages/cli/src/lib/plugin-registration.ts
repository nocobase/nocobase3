// Registers and unregisters a plugin in an application.
//
// The same three edits happen wherever an application lives: the manifest gains a dependency, `nocobase.plugins` gains
// a registration, and `client/plugins.ts` gains an import and an entry. Only two things differ between this repository
// and a generated application — where the plugin package is found, and what dependency range to record — so those are
// parameters and everything else is shared.
//
// The plan/apply split exists so `--dry-run` reports exactly what a real run would write, and so a caller that has to
// roll back knows which files to snapshot before writing.
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  MissingTypeScriptError,
  clientPluginsPath,
  createClientPluginsEditor,
  describeClientPluginEdit,
  formatClientPlugins,
  readClientPlugins,
  writeClientPlugins,
} from './client-plugins.ts';
import type { ManualClientPluginEdit } from './client-plugins.ts';
import {
  SKILLS_DIRECTORY,
  isOwnedSkillName,
  pluginSkillPrefix,
} from './skills-sync.ts';

const PACKAGE_SCOPE = '@nocobase/';
const PLUGIN_PREFIX = `${PACKAGE_SCOPE}app-plugin-`;
const SHORT_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export interface PluginRegistrationPlan {
  /** Whether anything would change; a re-registration of an unchanged plugin is a no-op. */
  readonly changed: boolean;
  readonly clientPluginsChanged: boolean;
  readonly clientPluginsPath: string;
  /** The updated `client/plugins.ts`, absent when that file needs no change. */
  readonly clientPluginsText?: string;
  readonly enabled: boolean;
  readonly manifestChanged: boolean;
  readonly manifestPath: string;
  /** The updated `package.json`, absent when the manifest needs no change. */
  readonly manifestText?: string;
  /**
   * Set when the client entry could not be written automatically because the application has no TypeScript. The
   * registration still stands; these are the lines left for a person or an agent to add.
   */
  readonly manualClientEdit?: ManualClientPluginEdit;
  readonly packageName: string;
  /** Why the client entry was skipped, for commands that report it. */
  readonly skippedClientEntry?:
    'disabled' | 'no-client-entry' | 'no-typescript';
}

export interface PluginUnregistrationPlan {
  readonly changed: boolean;
  readonly clientPluginsChanged: boolean;
  readonly clientPluginsPath: string;
  readonly clientPluginsText?: string;
  readonly manifestChanged: boolean;
  readonly manifestPath: string;
  readonly manifestText?: string;
  /** Set when client/plugins.ts still holds the entry because the app has no TypeScript to edit it with. */
  readonly manualClientEdit?: ManualClientPluginEdit;
  readonly packageName: string;
  /** Which parts of the application the plugin was removed from, for reporting. */
  readonly removedFrom: readonly string[];
}

/**
 * Expands what a user typed into a full package name. Short names are the common case, but a full name has to keep
 * working because that is what the manifest and every error message show.
 */
export function pluginPackageName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') {
    throw new Error('A plugin name is required.');
  }
  if (trimmed.startsWith(PLUGIN_PREFIX)) {
    const shortName = trimmed.slice(PLUGIN_PREFIX.length);
    if (!SHORT_NAME_PATTERN.test(shortName)) {
      throw new Error(
        `Plugin name "${trimmed}" must be lower-case kebab-case, for example ${PLUGIN_PREFIX}audit-log.`,
      );
    }
    return trimmed;
  }
  if (trimmed.includes('/') || trimmed.startsWith('@')) {
    throw new Error(
      `Plugin "${trimmed}" must be a short name such as audit-log, or a full ${PLUGIN_PREFIX}* package name.`,
    );
  }
  if (!SHORT_NAME_PATTERN.test(trimmed)) {
    throw new Error(
      `Plugin name "${trimmed}" must be lower-case kebab-case, for example audit-log.`,
    );
  }
  return `${PLUGIN_PREFIX}${trimmed}`;
}

/** The short name a package name carries, for messages and directory lookups. */
export function pluginShortName(packageName: string): string {
  return packageName.startsWith(PLUGIN_PREFIX)
    ? packageName.slice(PLUGIN_PREFIX.length)
    : packageName;
}

/**
 * Whether a plugin actually contributes to the client. A server-only plugin has no `./client/plugin` export, and
 * writing an import for one produces an application that fails to resolve at build time, so the client entry is
 * skipped rather than written blind.
 */
export async function hasClientPluginEntry(
  pluginDirectory: string,
): Promise<boolean> {
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(
      await readFile(path.join(pluginDirectory, 'package.json'), 'utf8'),
    ) as Record<string, unknown>;
  } catch {
    return false;
  }
  const exports = manifest.exports;
  if (!isRecord(exports)) {
    return false;
  }
  return exports['./client/plugin'] !== undefined;
}

/**
 * Computes the registration without writing it. `pluginDirectory` is where the plugin package can be read from, which
 * is a workspace directory in this repository and an installed dependency in a generated application.
 */
export async function planPluginRegistration({
  appRoot,
  dependencyField = 'devDependencies',
  dependencyRange,
  enabled = true,
  packageName,
  pluginDirectory,
}: {
  appRoot: string;
  dependencyField?: 'dependencies' | 'devDependencies';
  dependencyRange: string;
  enabled?: boolean;
  packageName: string;
  pluginDirectory: string;
}): Promise<PluginRegistrationPlan> {
  const manifestPath = path.join(appRoot, 'package.json');
  const originalManifest = await readFile(manifestPath, 'utf8');
  const manifest = parseJson(originalManifest, manifestPath);

  const manifestChanged = registerInManifest({
    dependencyField,
    dependencyRange,
    enabled,
    manifest,
    manifestPath,
    packageName,
  });

  // A disabled registration installs the dependency without wiring the client entry, and a server-only plugin has no
  // client entry to wire, so both leave client/plugins.ts untouched.
  const shipsClientEntry = await hasClientPluginEntry(pluginDirectory);
  const skippedClientEntry = !enabled
    ? 'disabled'
    : shipsClientEntry
      ? undefined
      : 'no-client-entry';

  const client =
    skippedClientEntry === undefined
      ? await planClientAddition(appRoot, packageName)
      : { changed: false, filePath: clientPluginsPath(appRoot) };

  // Losing the whole registration because the app cannot format one file would throw away a working install and a
  // correct manifest. The dependency, the registration and the skills need no compiler, so only this one edit
  // degrades, and it degrades into instructions precise enough to apply by hand.
  const resolvedSkip = client.missingTypeScript
    ? 'no-typescript'
    : skippedClientEntry;

  return {
    changed: manifestChanged || client.changed,
    clientPluginsChanged: client.changed,
    clientPluginsPath: client.filePath,
    ...(client.sourceText === undefined
      ? {}
      : { clientPluginsText: client.sourceText }),
    enabled,
    ...(client.missingTypeScript
      ? { manualClientEdit: describeClientPluginEdit(appRoot, packageName) }
      : {}),
    manifestChanged,
    manifestPath,
    ...(manifestChanged
      ? { manifestText: `${JSON.stringify(manifest, null, 2)}\n` }
      : {}),
    packageName,
    ...(resolvedSkip === undefined ? {} : { skippedClientEntry: resolvedSkip }),
  };
}

/** Computes the removal of a registration without writing it. */
export async function planPluginUnregistration({
  appRoot,
  packageName,
}: {
  appRoot: string;
  packageName: string;
}): Promise<PluginUnregistrationPlan> {
  const manifestPath = path.join(appRoot, 'package.json');
  const originalManifest = await readFile(manifestPath, 'utf8');
  const manifest = parseJson(originalManifest, manifestPath);

  const removedFrom = unregisterInManifest(manifest, manifestPath, packageName);
  const client = await planClientRemoval(appRoot, packageName);
  if (client.changed) {
    removedFrom.push('client/plugins.ts');
  }

  return {
    changed: removedFrom.length > 0,
    clientPluginsChanged: client.changed,
    clientPluginsPath: client.filePath,
    ...(client.sourceText === undefined
      ? {}
      : { clientPluginsText: client.sourceText }),
    manifestChanged: removedFrom.some((entry) => entry !== 'client/plugins.ts'),
    manifestPath,
    ...(removedFrom.some((entry) => entry !== 'client/plugins.ts')
      ? { manifestText: `${JSON.stringify(manifest, null, 2)}\n` }
      : {}),
    ...(client.missingTypeScript
      ? { manualClientEdit: describeClientPluginEdit(appRoot, packageName) }
      : {}),
    packageName,
    removedFrom,
  };
}

/** Writes a plan produced by either planner. */
export async function applyPluginRegistration(
  appRoot: string,
  plan: PluginRegistrationPlan | PluginUnregistrationPlan,
): Promise<void> {
  if (plan.manifestText !== undefined) {
    await writeFile(plan.manifestPath, plan.manifestText);
  }
  if (plan.clientPluginsText !== undefined) {
    await writeClientPlugins(appRoot, plan.clientPluginsText);
  }
}

/**
 * Deletes the skill directories a plugin owns. Synchronization only ever writes the prefixes of registered plugins, so
 * it never cleans up after an unregistration; this does.
 */
export async function removePluginSkills(
  appRoot: string,
  packageName: string,
): Promise<string[]> {
  const skillsRoot = path.join(appRoot, SKILLS_DIRECTORY);
  const prefix = pluginSkillPrefix(packageName);
  let entries;
  try {
    entries = await readdir(skillsRoot, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error, 'ENOENT') || isNodeError(error, 'ENOTDIR')) {
      return [];
    }
    throw error;
  }

  const removed: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isOwnedSkillName(prefix, entry.name)) {
      continue;
    }
    await rm(path.join(skillsRoot, entry.name), {
      force: true,
      recursive: true,
    });
    removed.push(entry.name);
  }
  return removed.sort();
}

interface ClientEditPlan {
  readonly changed: boolean;
  readonly filePath: string;
  readonly missingTypeScript?: boolean;
  readonly sourceText?: string;
}

async function planClientAddition(
  appRoot: string,
  packageName: string,
): Promise<ClientEditPlan> {
  const { filePath, sourceText } = await readClientPlugins(appRoot);
  let editor;
  try {
    editor = await createClientPluginsEditor(appRoot);
  } catch (error) {
    if (error instanceof MissingTypeScriptError) {
      return { changed: false, filePath, missingTypeScript: true };
    }
    throw error;
  }
  const added = editor.add(sourceText, packageName);
  if (!added.changed) {
    return { changed: false, filePath };
  }
  return {
    changed: true,
    filePath,
    sourceText: await formatClientPlugins(appRoot, added.sourceText, filePath),
  };
}

async function planClientRemoval(
  appRoot: string,
  packageName: string,
): Promise<ClientEditPlan> {
  const { exists, filePath, sourceText } = await readClientPlugins(appRoot);
  if (!exists) {
    return { changed: false, filePath };
  }
  let editor;
  try {
    editor = await createClientPluginsEditor(appRoot);
  } catch (error) {
    if (error instanceof MissingTypeScriptError) {
      return { changed: false, filePath, missingTypeScript: true };
    }
    throw error;
  }
  const removed = editor.remove(sourceText, packageName);
  if (!removed.changed) {
    return { changed: false, filePath };
  }
  return {
    changed: true,
    filePath,
    sourceText: await formatClientPlugins(
      appRoot,
      removed.sourceText,
      filePath,
    ),
  };
}

function registerInManifest({
  dependencyField,
  dependencyRange,
  enabled,
  manifest,
  manifestPath,
  packageName,
}: {
  dependencyField: 'dependencies' | 'devDependencies';
  dependencyRange: string;
  enabled: boolean;
  manifest: Record<string, unknown>;
  manifestPath: string;
  packageName: string;
}): boolean {
  const dependencies = ensureRecord(manifest, dependencyField, manifestPath);
  const existingDependency = dependencies[packageName];
  if (
    existingDependency !== undefined &&
    existingDependency !== dependencyRange
  ) {
    // A malformed manifest can hold a non-string here, so render it as JSON rather than letting an object stringify
    // to `[object Object]` in the very message meant to identify it.
    throw new Error(
      `${manifestPath} already declares ${packageName} as ${JSON.stringify(existingDependency)}; refusing to overwrite it.`,
    );
  }

  const nocobase = ensureRecord(manifest, 'nocobase', manifestPath);
  const plugins = ensureRecord(nocobase, 'plugins', manifestPath);
  const existingRegistration = plugins[packageName];
  if (existingRegistration !== undefined && !isRecord(existingRegistration)) {
    throw new Error(
      `${manifestPath} has an invalid nocobase.plugins registration for ${packageName}.`,
    );
  }

  let changed = false;
  if (existingDependency === undefined) {
    insertSorted(dependencies, packageName, dependencyRange);
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

function unregisterInManifest(
  manifest: Record<string, unknown>,
  manifestPath: string,
  packageName: string,
): string[] {
  const removedFrom: string[] = [];

  for (const field of ['dependencies', 'devDependencies'] as const) {
    const dependencies = manifest[field];
    if (dependencies === undefined) {
      continue;
    }
    if (!isRecord(dependencies)) {
      throw new Error(`${manifestPath} must define ${field} as an object.`);
    }
    if (Object.prototype.hasOwnProperty.call(dependencies, packageName)) {
      delete dependencies[packageName];
      removedFrom.push(field);
    }
  }

  const nocobase = manifest.nocobase;
  if (nocobase !== undefined && !isRecord(nocobase)) {
    throw new Error(`${manifestPath} must define nocobase as an object.`);
  }
  const plugins = nocobase?.plugins;
  if (plugins !== undefined && !isRecord(plugins)) {
    throw new Error(
      `${manifestPath} must define nocobase.plugins as an object.`,
    );
  }
  if (
    plugins !== undefined &&
    Object.prototype.hasOwnProperty.call(plugins, packageName)
  ) {
    delete plugins[packageName];
    removedFrom.push('nocobase.plugins');
  }

  return removedFrom;
}

function ensureRecord(
  parent: Record<string, unknown>,
  key: string,
  file: string,
): Record<string, unknown> {
  const value = parent[key];
  if (value === undefined) {
    const created: Record<string, unknown> = {};
    parent[key] = created;
    return created;
  }
  if (!isRecord(value)) {
    throw new Error(`${file} must define ${key} as an object.`);
  }
  return value;
}

/** Inserts in key order, so a registration produces the same diff wherever it runs. */
function insertSorted(
  record: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  const entries = Object.entries(record);
  const nextEntryIndex = entries.findIndex(
    ([existingKey]) => existingKey > key,
  );
  if (nextEntryIndex === -1) {
    record[key] = value;
    return;
  }

  const nextEntries: [string, unknown][] = [
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

function parseJson(contents: string, file: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Invalid JSON in ${file}.`, { cause: error });
  }
  if (!isRecord(value)) {
    throw new Error(`${file} must contain a JSON object.`);
  }
  return value;
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
