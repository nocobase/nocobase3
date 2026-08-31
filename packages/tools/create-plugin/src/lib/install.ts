import { spawnSync } from 'node:child_process';

export type WorkspaceSynchronizer = (
  repoRoot: string,
  targetDirectory: string,
) => void;

export const synchronizeWorkspace: WorkspaceSynchronizer = (
  repoRoot,
  targetDirectory,
) => {
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(pnpm, ['install', '--no-frozen-lockfile'], {
    cwd: repoRoot,
    env: { ...process.env, CI: 'true' },
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `pnpm install failed. The generated plugin was kept at ${targetDirectory}.`,
    );
  }
};
