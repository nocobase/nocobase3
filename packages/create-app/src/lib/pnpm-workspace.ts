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
 * All three are written regardless of which database was chosen. `better-sqlite3` is only installed for sqlite, but
 * listing it costs nothing and means switching an existing app to sqlite later just works, instead of failing with
 * that same opaque error. The list mirrors the repository's own `pnpm-workspace.yaml`, so an app and the monorepo
 * build the same set.
 */
export const ALLOWED_BUILDS: readonly string[] = [
  '@nocobase/app-portal-sdk',
  'better-sqlite3',
  'esbuild',
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
    await writeFile(target, buildAllowBuildsYaml(names), 'utf8');
    return;
  }

  const missing = names.filter((name) => !hasAllowBuildsEntry(existing, name));

  if (missing.length === 0) {
    return;
  }

  const merged = existing.includes('allowBuilds:')
    ? insertIntoAllowBuilds(existing, missing)
    : `${existing.trimEnd()}\n\n${buildAllowBuildsYaml(missing)}`;

  await writeFile(target, merged, 'utf8');
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
