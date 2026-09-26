import { readdir } from 'node:fs/promises';
import { EXIT_INVALID, InstallerError } from './errors.ts';
import type { Pm2 } from './pm2.ts';
import { runCommand } from './run-command.ts';

export const MINIMUM_NODE_MAJOR = 24;
export const MINIMUM_PNPM_MAJOR = 11;

export function majorOf(version: string): number {
  const match = version.trim().match(/^v?(\d+)/u);
  return match ? Number.parseInt(match[1], 10) : Number.NaN;
}

export function currentNodeMajor(): number {
  return majorOf(process.versions.node);
}

export function checkPlatform(
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform === 'win32') {
    throw new InstallerError(
      'PLATFORM_UNSUPPORTED',
      'hub-installer does not run on Windows: the release switch relies on symbolic links and atomic renames.',
      {
        exitCode: EXIT_INVALID,
        suggestions: [{ message: 'Run it inside WSL instead.' }],
      },
    );
  }
}

export async function checkPnpm(
  run: typeof runCommand = runCommand,
): Promise<string> {
  let version: string;
  try {
    version = (await run('pnpm', ['--version'])).stdout.trim();
  } catch {
    throw new InstallerError('PNPM_MISSING', 'pnpm was not found on PATH.', {
      exitCode: EXIT_INVALID,
      suggestions: [
        {
          message: `Install pnpm ${MINIMUM_PNPM_MAJOR}, then open a new shell:`,
          run: `corepack enable && corepack prepare pnpm@${MINIMUM_PNPM_MAJOR} --activate`,
        },
      ],
    });
  }
  if (!(majorOf(version) >= MINIMUM_PNPM_MAJOR)) {
    throw new InstallerError(
      'PNPM_UNSUPPORTED',
      `pnpm ${MINIMUM_PNPM_MAJOR} or later is required; found ${version}.`,
      {
        exitCode: EXIT_INVALID,
        suggestions: [
          {
            message: `Install pnpm ${MINIMUM_PNPM_MAJOR}, then open a new shell:`,
            run: `corepack enable && corepack prepare pnpm@${MINIMUM_PNPM_MAJOR} --activate`,
          },
        ],
      },
    );
  }
  return version;
}

export async function checkTar(
  run: typeof runCommand = runCommand,
): Promise<void> {
  try {
    await run('tar', ['--version']);
  } catch {
    throw new InstallerError('TAR_MISSING', 'tar was not found on PATH.', {
      exitCode: EXIT_INVALID,
      suggestions: [
        { message: 'Install tar with the system package manager.' },
      ],
    });
  }
}

/**
 * pm2 must be installed globally: `pm2 startup` writes a boot service that names pm2's own path, so a copy fetched
 * through `npx` into a cache would vanish from under it.
 */
export async function checkPm2(pm2: Pm2): Promise<string> {
  try {
    return await pm2.version();
  } catch {
    throw new InstallerError('PM2_MISSING', 'pm2 was not found on PATH.', {
      exitCode: EXIT_INVALID,
      suggestions: [
        { message: 'Install pm2 globally:', run: 'npm install -g pm2' },
        { message: 'Or install without starting the Hub, with --no-start.' },
      ],
    });
  }
}

/** The target must be new or empty; the installer never overwrites files it did not write. */
export async function checkTargetEmpty(root: string): Promise<boolean> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
  if (entries.length > 0) {
    throw new InstallerError('TARGET_NOT_EMPTY', `${root} is not empty.`, {
      exitCode: EXIT_INVALID,
      suggestions: [
        { message: 'Install into a new or empty directory.' },
        {
          message:
            'To manage a Hub this installer already set up there, use status, upgrade or rollback instead.',
        },
      ],
    });
  }
  return true;
}
