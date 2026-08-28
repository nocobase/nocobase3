import { access } from 'node:fs/promises';
import path from 'node:path';
import { CommandFailedError, runCommand } from './run-command.ts';

const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;
const VERIFY_TIMEOUT_MS = 60 * 1000;
const REBUILD_TIMEOUT_MS = 5 * 60 * 1000;

export async function installDependencies(
  directory: string,
  registry?: string,
): Promise<void> {
  const args = ['install'];
  if (registry) args.push(`--registry=${registry}`);

  try {
    await runCommand('pnpm', args, {
      cwd: directory,
      timeoutMs: INSTALL_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof CommandFailedError) {
      throw new Error(
        `Installing Hub dependencies failed.\n${error.stderr || error.message}`,
        { cause: error },
      );
    }
    throw error;
  }
}

export interface DriverVerification {
  ok: boolean;
  rebuilt?: boolean;
  reason?: string;
}

export async function verifySqliteDriver(
  directory: string,
): Promise<DriverVerification> {
  const driver = 'better-sqlite3';
  try {
    await access(path.join(directory, 'node_modules', driver));
  } catch {
    return { ok: false, reason: `${driver} was not installed.` };
  }

  if (await driverLoads(directory)) return { ok: true };

  try {
    await runCommand('pnpm', ['rebuild', driver], {
      cwd: directory,
      timeoutMs: REBUILD_TIMEOUT_MS,
    });
  } catch {
    return {
      ok: false,
      reason: `The ${driver} native addon could not be compiled. Run \`pnpm rebuild ${driver}\` inside the Hub directory.`,
    };
  }

  return (await driverLoads(directory))
    ? { ok: true, rebuilt: true }
    : {
        ok: false,
        reason: `The ${driver} native addon could not be loaded. Run \`pnpm rebuild ${driver}\` inside the Hub directory.`,
      };
}

async function driverLoads(directory: string): Promise<boolean> {
  try {
    await runCommand(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import('better-sqlite3').then((m) => new m.default(':memory:').close())",
      ],
      { cwd: directory, timeoutMs: VERIFY_TIMEOUT_MS },
    );
    return true;
  } catch {
    return false;
  }
}
