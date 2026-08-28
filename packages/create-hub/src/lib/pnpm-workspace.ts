import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const PNPM_WORKSPACE_FILE = 'pnpm-workspace.yaml';
export const ALLOWED_BUILDS: readonly string[] = ['better-sqlite3'];

export function buildWorkspaceYaml(
  names: readonly string[] = ALLOWED_BUILDS,
): string {
  return [
    '# Lets pnpm compile the SQLite native addon used by Hub.',
    'allowBuilds:',
    ...names.map((name) => `  ${name}: true`),
    '',
  ].join('\n');
}

export async function ensureAllowBuilds(
  directory: string,
  names: readonly string[] = ALLOWED_BUILDS,
): Promise<void> {
  const target = path.join(directory, PNPM_WORKSPACE_FILE);
  let existing = '';
  try {
    existing = await readFile(target, 'utf8');
  } catch {
    // A published Hub package normally has no workspace file.
  }

  if (!existing.trim()) {
    await writeFile(target, buildWorkspaceYaml(names), 'utf8');
    return;
  }

  const missing = names.filter((name) => {
    const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    return !new RegExp(`^\\s+['"]?${escaped}['"]?\\s*:`, 'mu').test(existing);
  });
  if (missing.length === 0) return;

  if (!/^allowBuilds\s*:/mu.test(existing)) {
    await writeFile(
      target,
      `${existing.trimEnd()}\n\n${buildWorkspaceYaml(missing)}`,
      'utf8',
    );
    return;
  }

  const lines = existing.split(/\r?\n/u);
  const index = lines.findIndex((line) => /^allowBuilds\s*:/u.test(line));
  lines.splice(index + 1, 0, ...missing.map((name) => `  ${name}: true`));
  await writeFile(target, `${lines.join('\n').trimEnd()}\n`, 'utf8');
}
