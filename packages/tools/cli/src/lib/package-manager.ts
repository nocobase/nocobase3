import { access } from 'node:fs/promises';
import path from 'node:path';

export type PackageManager = 'npm' | 'pnpm' | 'yarn';

const LOCKFILES: Array<[string, PackageManager]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
];

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Picks the package manager a project is already using, so running a script through the CLI does not create a second
 * lockfile next to the one that is there. The `packageManager` field wins when present because it is a deliberate
 * declaration; otherwise the lockfile on disk is the evidence. pnpm is the fallback, matching what the templates use.
 */
export async function detectPackageManager(
  directory: string,
  declared?: string,
): Promise<PackageManager> {
  const fromField = String(declared ?? '').split('@')[0];

  if (fromField === 'npm' || fromField === 'pnpm' || fromField === 'yarn') {
    return fromField;
  }

  for (const [lockfile, manager] of LOCKFILES) {
    if (await exists(path.join(directory, lockfile))) {
      return manager;
    }
  }

  return 'pnpm';
}
