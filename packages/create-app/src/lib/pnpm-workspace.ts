import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { driverNeedsBuild } from './database.ts';

export const PNPM_WORKSPACE_FILE = 'pnpm-workspace.yaml';

/**
 * pnpm 11 refuses to run a dependency's install script unless the package is listed here, and it reads the list from
 * `pnpm-workspace.yaml` alone — the `pnpm` field in `package.json` was removed in that major, and `.npmrc` never
 * carried build settings. Without this file `better-sqlite3` installs without compiling its native addon, and the app
 * fails at runtime with a "Could not locate the bindings file" error that says nothing about the real cause.
 *
 * Only drivers that actually build get an entry: `pg` and `mysql2` are pure JavaScript.
 */
export function buildAllowBuildsYaml(drivers: readonly string[]): string {
  const needBuild = drivers.filter((driver) => driverNeedsBuild(driver));

  if (needBuild.length === 0) {
    return '';
  }

  return [
    '# Lets pnpm run the install scripts these packages need to compile their native addons.',
    '# pnpm 11 reads this from pnpm-workspace.yaml only; see https://pnpm.io/settings/build.',
    'allowBuilds:',
    ...needBuild.map((driver) => `  ${driver}: true`),
    '',
  ].join('\n');
}

/**
 * Merges an `allowBuilds` entry into whatever the template already shipped.
 *
 * The template carries its own `pnpm-workspace.yaml` (generated at pack time), so this appends rather than overwrites
 * — clobbering it would drop settings the template deliberately set. Parsing YAML properly would mean taking on a
 * dependency for one shallow map, so the merge is textual and only handles the shape this file is ever written in.
 */
export async function ensureAllowBuilds(
  directory: string,
  drivers: readonly string[],
): Promise<void> {
  const needBuild = drivers.filter((driver) => driverNeedsBuild(driver));

  if (needBuild.length === 0) {
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
    await writeFile(target, buildAllowBuildsYaml(needBuild), 'utf8');
    return;
  }

  const missing = needBuild.filter(
    (driver) => !hasAllowBuildsEntry(existing, driver),
  );

  if (missing.length === 0) {
    return;
  }

  const merged = existing.includes('allowBuilds:')
    ? insertIntoAllowBuilds(existing, missing)
    : `${existing.trimEnd()}\n\n${buildAllowBuildsYaml(missing)}`;

  await writeFile(target, merged, 'utf8');
}

function hasAllowBuildsEntry(contents: string, driver: string): boolean {
  const pattern = new RegExp(
    `^\\s+${driver.replaceAll('.', '\\.')}\\s*:`,
    'mu',
  );
  return pattern.test(contents);
}

function insertIntoAllowBuilds(
  contents: string,
  drivers: readonly string[],
): string {
  const lines = contents.split(/\r?\n/u);
  const index = lines.findIndex((line) => /^allowBuilds\s*:/u.test(line));

  if (index === -1) {
    return `${contents.trimEnd()}\n\n${buildAllowBuildsYaml(drivers)}`;
  }

  lines.splice(index + 1, 0, ...drivers.map((driver) => `  ${driver}: true`));

  return `${lines.join('\n').trimEnd()}\n`;
}
