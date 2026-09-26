import { readFile, rename, writeFile } from 'node:fs/promises';
import { EXIT_INVALID, InstallerError } from './errors.ts';
import type { Layout } from './layout.ts';

export interface BuildTarget {
  platform: string;
  arch: string;
  libc?: string;
  nodeAbi?: number;
  nodeMajor: number;
}

export interface ReleaseRecord {
  version: string;
  installedAt: string;
  buildTarget: BuildTarget;
}

export interface HistoryEntry {
  action: 'install' | 'upgrade' | 'rollback';
  from?: string;
  to: string;
  at: string;
}

/** `installer.json`: what the installer knows about the Hub it manages. */
export interface InstallerState {
  schemaVersion: 1;
  /** pm2 process name. */
  name: string;
  registry: string;
  dialect: string;
  /** Driver packages added before each build, so an upgrade adds them again. */
  drivers: string[];
  current: string;
  releases: ReleaseRecord[];
  history: HistoryEntry[];
}

export async function readState(layout: Layout): Promise<InstallerState> {
  let text: string;
  try {
    text = await readFile(layout.stateFile, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new InstallerError(
        'NOT_INSTALLED',
        `${layout.root} holds no Hub installed by hub-installer (installer.json is missing).`,
        {
          exitCode: EXIT_INVALID,
          suggestions: [
            {
              message:
                'Run the command from the Hub root, or name it with --dir.',
            },
          ],
        },
      );
    }
    throw error;
  }
  const state = JSON.parse(text) as InstallerState;
  if (state.schemaVersion !== 1) {
    throw new InstallerError(
      'STATE_UNSUPPORTED',
      `installer.json has schemaVersion ${String(state.schemaVersion)}, which this hub-installer does not understand.`,
      {
        exitCode: EXIT_INVALID,
        suggestions: [
          {
            message: 'Use a newer hub-installer:',
            run: 'npx @nocobase/hub-installer@latest status',
          },
        ],
      },
    );
  }
  return state;
}

/** Writes the state through a temporary file and a rename, so a crash never leaves half a document behind. */
export async function writeState(
  layout: Layout,
  state: InstallerState,
): Promise<void> {
  const temporary = `${layout.stateFile}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporary, layout.stateFile);
}
