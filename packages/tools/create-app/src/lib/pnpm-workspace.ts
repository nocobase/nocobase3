import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const PNPM_WORKSPACE_FILE = 'pnpm-workspace.yaml';

/**
 * Packages the generated project lets pnpm run install scripts for.
 *
 * pnpm 11 refuses to run a dependency's install script unless the package is listed under `allowBuilds`, and it reads
 * that list from `pnpm-workspace.yaml` alone — the `pnpm` field in `package.json` was removed in that major, and
 * `.npmrc` never carried build settings. A package missing from the list installs without building, `pnpm install`
 * still reports success, and the failure surfaces much later: `better-sqlite3` throws "Could not locate the bindings
 * file" at the first query, naming nothing actionable.
 *
 * Both are written regardless of which database was chosen. `better-sqlite3` is only installed for sqlite, but
 * listing it costs nothing and means switching an existing app to sqlite later just works, instead of failing with
 * that same opaque error. The list mirrors the repository's own `pnpm-workspace.yaml`, so an app and the monorepo
 * build the same set.
 */
export const ALLOWED_BUILDS: readonly string[] = [
  'better-sqlite3',
  'esbuild',
  'oracledb',
];

/** YAML needs quotes around a scoped name, whose leading `@` would otherwise start a reserved indicator. */
function formatEntry(name: string): string {
  return name.startsWith('@') ? `  '${name}': true` : `  ${name}: true`;
}

export function buildAllowBuildsYaml(
  names: readonly string[] = ALLOWED_BUILDS,
): string {
  if (names.length === 0) {
    return '';
  }

  return [
    '# Lets pnpm run the install scripts these packages need to compile their native addons.',
    '# pnpm 11 reads this from pnpm-workspace.yaml only; see https://pnpm.io/settings/build.',
    'allowBuilds:',
    ...names.map(formatEntry),
    '',
  ].join('\n');
}

/**
 * Settings written alongside `allowBuilds`, keyed by the comment that explains each one.
 *
 * `trustLockfile` turns off the pass that re-applies `minimumReleaseAge` and `trustPolicy` to every entry already in
 * the lockfile. That check queries registry metadata for each package and holds it in memory for the whole install —
 * on a dependency tree this size it costs tens of seconds every time, and it re-verifies versions that were already
 * verified when they were first resolved and written to the lockfile.
 *
 * Anything newly resolved is still checked: the setting only skips re-auditing what the lockfile already pins. pnpm
 * documents the tradeoff as a lockfile that arrives from an untrusted contributor could carry entries that would not
 * pass today's policy, so a project taking lockfile changes from outside collaborators should set this back to false.
 */
export const WORKSPACE_SETTINGS: readonly {
  comment: readonly string[];
  key: string;
  value: string;
}[] = [
  {
    comment: [
      '# Skips re-auditing lockfile entries against the supply-chain policy on every install.',
      '# The check costs tens of seconds here and re-verifies versions the lockfile already pins;',
      '# newly resolved packages are still checked. Set to false if outside contributors edit the',
      '# lockfile. See https://pnpm.io/settings/dependency-resolution#trustlockfile.',
    ],
    key: 'trustLockfile',
    value: 'true',
  },
];

/** The complete `pnpm-workspace.yaml` a generated application starts with. */
export function buildWorkspaceYaml(
  names: readonly string[] = ALLOWED_BUILDS,
): string {
  const settings = WORKSPACE_SETTINGS.flatMap((setting) => [
    ...setting.comment,
    `${setting.key}: ${setting.value}`,
    '',
  ]);

  return [buildAllowBuildsYaml(names), ...settings].join('\n');
}

/**
 * Writes the `allowBuilds` list into the generated project, merging into whatever the template already shipped.
 *
 * A template may carry its own `pnpm-workspace.yaml`; clobbering it would drop settings it deliberately set, so an
 * existing `allowBuilds` block is added to rather than replaced, and entries already present are left alone. Parsing
 * YAML properly would mean taking on a dependency for one shallow map, so the merge is textual and only handles the
 * shape this file is ever written in.
 */
export async function ensureAllowBuilds(
  directory: string,
  names: readonly string[] = ALLOWED_BUILDS,
): Promise<void> {
  if (names.length === 0) {
    return;
  }

  const target = path.join(directory, PNPM_WORKSPACE_FILE);
  let existing = '';

  try {
    existing = await readFile(target, 'utf8');
  } catch {
    // No file yet; the generated block below stands on its own.
  }

  if (existing.trim() === '') {
    await writeFile(target, buildWorkspaceYaml(names), 'utf8');
    return;
  }

  const missing = names.filter((name) => !hasAllowBuildsEntry(existing, name));
  let merged = existing;

  if (missing.length > 0) {
    merged = merged.includes('allowBuilds:')
      ? insertIntoAllowBuilds(merged, missing)
      : `${merged.trimEnd()}\n\n${buildAllowBuildsYaml(missing)}`;
  }

  // A template that already set one of these made a deliberate choice, so only the absent ones are appended.
  const absent = WORKSPACE_SETTINGS.filter(
    (setting) => !hasTopLevelKey(merged, setting.key),
  );

  if (absent.length > 0) {
    const block = absent.flatMap((setting) => [
      ...setting.comment,
      `${setting.key}: ${setting.value}`,
      '',
    ]);
    merged = `${merged.trimEnd()}\n\n${block.join('\n')}`;
  }

  if (merged === existing) {
    return;
  }

  await writeFile(target, merged, 'utf8');
}

/** A top-level key sits at column zero, so an `allowBuilds` entry of the same name cannot be mistaken for one. */
function hasTopLevelKey(contents: string, key: string): boolean {
  return new RegExp(`^${key}\\s*:`, 'mu').test(contents);
}

/** Matches an entry written either bare or quoted, since a scoped name needs quotes and an unscoped one does not. */
function hasAllowBuildsEntry(contents: string, name: string): boolean {
  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');

  return new RegExp(`^\\s+['"]?${escaped}['"]?\\s*:`, 'mu').test(contents);
}

function insertIntoAllowBuilds(
  contents: string,
  names: readonly string[],
): string {
  const lines = contents.split(/\r?\n/u);
  const index = lines.findIndex((line) => /^allowBuilds\s*:/u.test(line));

  if (index === -1) {
    return `${contents.trimEnd()}\n\n${buildAllowBuildsYaml(names)}`;
  }

  lines.splice(index + 1, 0, ...names.map(formatEntry));

  return `${lines.join('\n').trimEnd()}\n`;
}
