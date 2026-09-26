import { open, readFile, rm } from 'node:fs/promises';
import { EXIT_INVALID, InstallerError } from './errors.ts';

export type ReleaseLock = () => Promise<void>;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Takes the root's lock so two installers never run against the same Hub. The file holds the owner's pid; a lock whose
 * owner is gone is stale and is taken over rather than blocking every later run.
 */
export async function acquireLock(file: string): Promise<ReleaseLock> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(file, 'wx');
      await handle.writeFile(`${process.pid}\n`);
      await handle.close();
      return async () => {
        await rm(file, { force: true });
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const owner = Number.parseInt(
        (await readFile(file, 'utf8').catch(() => '')).trim(),
        10,
      );
      if (Number.isInteger(owner) && owner !== process.pid && isAlive(owner)) {
        throw new InstallerError(
          'LOCKED',
          `Another hub-installer (pid ${owner}) is working on this Hub.`,
          {
            exitCode: EXIT_INVALID,
            suggestions: [
              { message: 'Wait for it to finish, then run the command again.' },
            ],
          },
        );
      }
      await rm(file, { force: true });
    }
  }
  throw new InstallerError('LOCKED', `Could not take the lock at ${file}.`, {
    exitCode: EXIT_INVALID,
  });
}
