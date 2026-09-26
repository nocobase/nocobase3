import { existsSync } from 'node:fs';
import path from 'node:path';
import { Flags } from '@oclif/core';
import { restoreDatabase } from '../lib/backup.ts';
import { confirm } from '../lib/confirm.ts';
import { switchCurrent } from '../lib/current-link.ts';
import { healthUrl, readHubEnv } from '../lib/env-file.ts';
import {
  EXIT_INVALID,
  EXIT_ROLLBACK_FAILED,
  InstallerError,
} from '../lib/errors.ts';
import { layoutOf, releaseDir, releaseLinkTarget } from '../lib/layout.ts';
import { acquireLock } from '../lib/lock.ts';
import { checkPlatform, checkPm2, currentNodeMajor } from '../lib/prechecks.ts';
import {
  errorLogTail,
  startHub,
  stopHub,
  type ServiceOptions,
} from '../lib/service.ts';
import {
  readState,
  writeState,
  type HistoryEntry,
  type InstallerState,
} from '../lib/state.ts';
import type { CommandDeps, CommandOutcome } from './install.ts';

export const ROLLBACK_FLAGS = {
  dir: Flags.string({
    description:
      'Hub root managed by hub-installer. Defaults to the current directory.',
  }),
  to: Flags.string({
    description:
      'Release to return to. Defaults to the one the last upgrade came from.',
  }),
  restore: Flags.boolean({
    allowNo: true,
    default: true,
    description:
      'Restore the database backed up before the upgrade, when that upgrade migrated it.',
  }),
  'health-timeout': Flags.integer({
    default: 180,
    description: 'Seconds to wait for the release to answer its health check.',
  }),
  yes: Flags.boolean({
    default: false,
    description: 'Proceed without asking for confirmation.',
  }),
  json: Flags.boolean({
    default: false,
    description: 'Print one JSON result on stdout; progress stays on stderr.',
  }),
};

export interface RollbackInput {
  flags: {
    dir?: string;
    to?: string;
    restore: boolean;
    'health-timeout': number;
    yes: boolean;
    json: boolean;
  };
}

function lastUpgrade(
  history: readonly HistoryEntry[],
  matches: (entry: HistoryEntry) => boolean,
): HistoryEntry | undefined {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (
      entry.action === 'upgrade' &&
      entry.outcome !== 'rolled-back' &&
      matches(entry)
    ) {
      return entry;
    }
  }
  return undefined;
}

/** The release to return to: the interrupted operation's origin, else where the last completed upgrade came from. */
export function defaultRollbackTarget(
  state: InstallerState,
): string | undefined {
  // An interrupted upgrade is undone; an interrupted rollback is finished.
  if (state.pending) {
    return state.pending.action === 'upgrade'
      ? state.pending.from
      : state.pending.to;
  }
  return lastUpgrade(state.history, (entry) => entry.to === state.current)
    ?.from;
}

/**
 * The backup that holds the database as it was on `target`, and whether it needs restoring: only when the upgrade away
 * from `target` applied migrations. An interrupted upgrade is treated as having migrated, since how far it got is unknown.
 */
export function backupFor(
  state: InstallerState,
  target: string,
): { backup?: string; migrated: boolean } {
  if (state.pending?.action === 'upgrade' && state.pending.from === target) {
    return { backup: state.pending.backup, migrated: true };
  }
  const upgrade = lastUpgrade(
    state.history,
    (entry) => entry.from === target && entry.to === state.current,
  );
  return {
    backup: upgrade?.backup,
    migrated: (upgrade?.migrations ?? 0) > 0,
  };
}

export async function rollback(
  input: RollbackInput,
  deps: CommandDeps,
): Promise<CommandOutcome> {
  const { flags } = input;
  const { reporter, pm2 } = deps;
  const root = path.resolve(deps.cwd ?? process.cwd(), flags.dir ?? '.');
  const layout = layoutOf(root);
  const state = await readState(layout);
  const releaseLock = await acquireLock(layout.lockFile);
  try {
    checkPlatform();
    const from = state.current;
    const interrupted = state.pending;
    const target = flags.to ?? defaultRollbackTarget(state);
    if (target === undefined) {
      throw new InstallerError(
        'NOTHING_TO_ROLL_BACK',
        `No upgrade led to ${from}, so there is no earlier release to return to.`,
        {
          exitCode: EXIT_INVALID,
          suggestions: [
            { message: 'Name a release on disk with --to; status lists them.' },
          ],
        },
      );
    }
    if (target === from && !state.pending) {
      return {
        status: 'success-noop',
        result: { directory: root, current: from, rolledBack: false },
        summary: [`The Hub is already on ${from}.`],
      };
    }
    const record = state.releases.find((entry) => entry.version === target);
    if (!record || !existsSync(releaseDir(layout, target))) {
      throw new InstallerError(
        'RELEASE_MISSING',
        `${target} is not on disk; only releases hub-installer kept can be returned to.`,
        {
          exitCode: EXIT_INVALID,
          suggestions: [{ message: 'status lists the releases on disk.' }],
        },
      );
    }
    const machineMajor = currentNodeMajor();
    if (record.buildTarget.nodeMajor !== machineMajor) {
      throw new InstallerError(
        'NODE_MISMATCH',
        `${target} was built for Node ${record.buildTarget.nodeMajor}, but this machine runs Node ${machineMajor}; its native modules would not load.`,
        { exitCode: EXIT_INVALID },
      );
    }
    await checkPm2(pm2);

    const { backup, migrated } = backupFor(state, target);
    const restore = flags.restore && migrated && backup !== undefined;
    if (flags.restore && migrated && backup === undefined) {
      reporter.warn(
        `The upgrade from ${target} migrated a database hub-installer did not back up; restore it from your own backup if ${target} misbehaves.`,
      );
    }
    await confirm(
      [
        `Roll the Hub at ${root} back from ${from} to ${target}.`,
        'The Hub and every application it hosts stop while the release switches.',
        restore
          ? `The Hub database is restored from ${backup}: whatever was written to the Hub since that upgrade — uploaded releases, deployments, settings — is lost.`
          : 'The database is left as it is; rolling back does not undo migrations.',
      ],
      { yes: flags.yes, json: flags.json },
    );

    const env = await readHubEnv(layout);
    const service: ServiceOptions = {
      layout,
      pm2,
      name: state.name,
      healthUrl: healthUrl(env),
      fetchImpl: deps.fetchImpl,
    };
    state.pending = {
      action: 'rollback',
      from,
      to: target,
      startedAt: new Date().toISOString(),
    };
    await writeState(layout, state);

    reporter.progress(`Stopping ${from}`);
    let healthy = false;
    let failure: unknown;
    try {
      await stopHub(service);
      if (restore && backup) {
        reporter.progress(`Restoring the database from ${backup}`);
        await restoreDatabase(layout, backup);
      }
      await switchCurrent(layout, releaseLinkTarget(target));
      reporter.progress(`Starting ${target}`);
      healthy = await startHub({
        ...service,
        timeoutMs: flags['health-timeout'] * 1000,
      });
    } catch (error) {
      failure = error;
    }

    state.current = target;
    delete state.pending;
    state.history.push({
      action: 'rollback',
      from,
      to: target,
      at: new Date().toISOString(),
      databaseRestored: restore && failure === undefined,
    });
    await writeState(layout, state);

    if (!healthy) {
      throw new InstallerError(
        'ROLLBACK_FAILED',
        `${target} did not come back${failure instanceof Error ? ` (${failure.message})` : ''}. The Hub is down.`,
        {
          exitCode: EXIT_ROLLBACK_FAILED,
          details: { log: await errorLogTail(layout) },
          suggestions: [
            {
              message: 'Read the error log:',
              run: `tail -n 100 ${path.join(layout.logsDir, 'hub.err.log')}`,
            },
            {
              message: `Or switch back to ${from}:`,
              run: `hub-installer rollback --dir ${root} --to ${from} --no-restore`,
            },
          ],
        },
      );
    }
    return {
      status: 'success',
      result: {
        directory: root,
        from,
        to: target,
        rolledBack: true,
        recovered: interrupted ? interrupted.action : null,
        databaseRestored: restore,
        backup: restore ? backup : null,
      },
      summary: [
        interrupted
          ? `Recovered from the interrupted ${interrupted.action} (${interrupted.from} to ${interrupted.to}); the Hub runs ${target}.`
          : `Rolled the Hub back from ${from} to ${target}.`,
        restore
          ? `  Database restored from ${backup}`
          : '  Database left as it was',
      ],
    };
  } finally {
    await releaseLock();
  }
}
