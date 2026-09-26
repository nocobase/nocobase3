import { existsSync } from 'node:fs';
import { rm, statfs } from 'node:fs/promises';
import path from 'node:path';
import { Flags } from '@oclif/core';
import { pendingTaskCount, runAppCli } from '../lib/app-cli.ts';
import {
  backupForUpgrade,
  backupName,
  HUB_DATABASE,
  removeBackup,
  restoreDatabase,
  type BackupResult,
} from '../lib/backup.ts';
import { confirm } from '../lib/confirm.ts';
import { switchCurrent } from '../lib/current-link.ts';
import { healthUrl, readHubEnv } from '../lib/env-file.ts';
import {
  EXIT_FAILED,
  EXIT_INVALID,
  EXIT_ROLLBACK_FAILED,
  EXIT_ROLLED_BACK,
  InstallerError,
} from '../lib/errors.ts';
import {
  layoutOf,
  releaseDir,
  releaseLinkTarget,
  type Layout,
} from '../lib/layout.ts';
import { acquireLock } from '../lib/lock.ts';
import {
  checkPlatform,
  checkPm2,
  checkPnpm,
  checkPortFree,
  checkTar,
  currentNodeMajor,
} from '../lib/prechecks.ts';
import { resolveTemplateVersion } from '../lib/registry.ts';
import { prepareRelease, verifyBuildTarget } from '../lib/release.ts';
import { runCommand } from '../lib/run-command.ts';
import {
  checkPm2Ownership,
  errorLogTail,
  startHub,
  stopHub,
  type ServiceOptions,
} from '../lib/service.ts';
import {
  readState,
  writeState,
  type InstallerState,
  type ReleaseRecord,
} from '../lib/state.ts';
import { compareVersions } from '../lib/version.ts';
import type { CommandDeps, CommandOutcome } from './install.ts';

/** A build needs room for the sources and development dependencies (about 900 MB) plus the release and a backup. */
const MINIMUM_FREE_BYTES = 2 * 1024 ** 3;

export const UPGRADE_FLAGS = {
  dir: Flags.string({
    description:
      'Hub root managed by hub-installer. Defaults to the current directory.',
  }),
  to: Flags.string({
    default: 'latest',
    description:
      'Version or dist-tag to upgrade to. A version already on disk is reused without building.',
  }),
  'backup-done': Flags.boolean({
    default: false,
    description:
      'Confirm that an external database is backed up; required for any dialect but SQLite.',
  }),
  'health-timeout': Flags.integer({
    default: 180,
    min: 1,
    description:
      'Seconds to wait for the new release to answer its health check.',
  }),
  keep: Flags.integer({
    default: 3,
    min: 2,
    description:
      'Releases to keep on disk, counting the new one; the one upgraded from is always kept so rollback stays possible.',
  }),
  'keep-source': Flags.boolean({
    default: false,
    description:
      'Keep the build directory with the sources and development dependencies.',
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

export interface UpgradeInput {
  flags: {
    dir?: string;
    to: string;
    'backup-done': boolean;
    'health-timeout': number;
    keep: number;
    'keep-source': boolean;
    yes: boolean;
    json: boolean;
  };
}

/** The running Hub was interrupted by a previous operation that never finished; refuse to stack another on top. */
export function assertNoPending(state: InstallerState): void {
  if (!state.pending) return;
  const { action, from, to, startedAt } = state.pending;
  throw new InstallerError(
    'OPERATION_INTERRUPTED',
    `${action === 'upgrade' ? 'An' : 'A'} ${action} from ${from} to ${to}, started ${startedAt}, did not finish; the Hub may be stopped or half-switched.`,
    {
      exitCode: EXIT_INVALID,
      suggestions: [
        {
          message:
            'Recover first; an interrupted upgrade is undone and an interrupted rollback is finished:',
          run: 'hub-installer rollback',
        },
      ],
    },
  );
}

async function resolveTarget(
  state: InstallerState,
  requested: string,
  deps: CommandDeps,
): Promise<string> {
  if (state.releases.some((record) => record.version === requested)) {
    return requested;
  }
  return resolveTemplateVersion(state.registry, requested, deps.fetchImpl);
}

/**
 * Keeps the newest `keep` releases by install time. `protect` — the current release and the one it was upgraded from,
 * which `rollback` returns to — is never pruned, whatever its install time.
 */
export function releasesToPrune(
  releases: readonly ReleaseRecord[],
  protect: readonly string[],
  keep: number,
): ReleaseRecord[] {
  const newestFirst = [...releases].sort((a, b) =>
    b.installedAt.localeCompare(a.installedAt),
  );
  const kept = new Set(protect);
  for (const record of newestFirst) {
    if (kept.size >= keep) break;
    kept.add(record.version);
  }
  return releases.filter((record) => !kept.has(record.version));
}

/** Whether a recorded release can run here: built for this platform, architecture and Node major. */
function fitsMachine(record: ReleaseRecord): boolean {
  try {
    verifyBuildTarget(record.buildTarget);
    return true;
  } catch {
    return false;
  }
}

function replaceRecord(state: InstallerState, record: ReleaseRecord): void {
  state.releases = [
    ...state.releases.filter((entry) => entry.version !== record.version),
    record,
  ];
}

async function checkFreeSpace(root: string): Promise<void> {
  const stats = await statfs(root);
  const free = stats.bavail * stats.bsize;
  if (free < MINIMUM_FREE_BYTES) {
    throw new InstallerError(
      'DISK_LOW',
      `${root} has ${Math.round(free / 1024 ** 2)} MB free; building a release needs about ${MINIMUM_FREE_BYTES / 1024 ** 3} GB.`,
      {
        exitCode: EXIT_INVALID,
        suggestions: [
          {
            message:
              'Free some space, or lower --keep to prune old releases on the next upgrade.',
          },
        ],
      },
    );
  }
}

interface RollbackContext {
  layout: Layout;
  state: InstallerState;
  service: ServiceOptions;
  from: string;
  to: string;
  pending: number;
  backup: BackupResult;
  /** Set when this upgrade built the release rather than reusing one already recorded. */
  newRecord: ReleaseRecord | undefined;
  timeoutMs: number;
  cause: unknown;
}

/**
 * Undoes an upgrade that failed after the switch: the new release is stopped, `current` goes back, the database is
 * restored when the new release may have migrated it, and the previous release is started again. Always throws: exit 3
 * when the previous release is healthy again, exit 4 when it is not.
 *
 * When the previous release does not come back, the operation stays pending and the new release stays on disk and on
 * record: it may be the only one that can run, as when the machine's Node major changed, and `rollback` recovers from
 * the pending state.
 */
async function rollBackUpgrade(context: RollbackContext): Promise<never> {
  const { layout, state, service, from, to, backup } = context;
  const reason =
    context.cause instanceof Error
      ? context.cause.message
      : String(context.cause);
  await service.pm2.remove(service.name).catch(() => undefined);
  const log = await errorLogTail(layout);

  let databaseRestored = false;
  let healthy = false;
  let rollbackError: unknown;
  try {
    await switchCurrent(layout, releaseLinkTarget(from));
    if (context.pending > 0 && backup.databaseFiles.length > 0) {
      await restoreDatabase(layout, backup.relative);
      databaseRestored = true;
    }
    healthy = await startHub({ ...service, timeoutMs: context.timeoutMs });
  } catch (error) {
    rollbackError = error;
  }

  if (healthy) {
    if (context.newRecord) {
      await rm(path.dirname(releaseDir(layout, to)), {
        recursive: true,
        force: true,
      });
    }
    delete state.pending;
  } else if (context.newRecord) {
    replaceRecord(state, context.newRecord);
  }
  state.history.push({
    action: 'upgrade',
    from,
    to,
    at: new Date().toISOString(),
    outcome: 'rolled-back',
    migrations: context.pending,
    backup: backup.relative,
    databaseRestored,
  });
  await writeState(layout, state);

  const externalDatabaseNote =
    context.pending > 0 && backup.databaseFiles.length === 0
      ? ` ${to} may already have migrated the external database; restore it from your own backup if ${from} misbehaves.`
      : '';
  if (healthy) {
    throw new InstallerError(
      'UPGRADE_ROLLED_BACK',
      `Upgrading to ${to} failed (${reason}). ${from} is running again${databaseRestored ? ' on the database restored from the backup' : ''}.${externalDatabaseNote}`,
      {
        exitCode: EXIT_ROLLED_BACK,
        details: { log, backup: backup.relative, databaseRestored },
        suggestions: [
          {
            message: 'The failed release logged:',
            run: `tail -n 100 ${path.join(layout.logsDir, 'hub.err.log')}`,
          },
        ],
      },
    );
  }
  throw new InstallerError(
    'ROLLBACK_FAILED',
    `Upgrading to ${to} failed (${reason}), and ${from} did not come back either${rollbackError instanceof Error ? ` (${rollbackError.message})` : ''}. The Hub is down.`,
    {
      exitCode: EXIT_ROLLBACK_FAILED,
      details: { log, backup: backup.relative, databaseRestored },
      suggestions: [
        {
          message: 'Read the error log:',
          run: `tail -n 100 ${path.join(layout.logsDir, 'hub.err.log')}`,
        },
        ...(backup.databaseFiles.length > 0 && !databaseRestored
          ? [
              {
                message: `Put the database from before the upgrade back, from ${backup.relative}, into:`,
                run: path.dirname(path.join(layout.storageDir, HUB_DATABASE)),
              },
            ]
          : []),
        {
          message:
            'Once the cause is fixed, finish the rollback; it restores the database from the backup if needed:',
          run: `hub-installer rollback --dir ${layout.root}`,
        },
        ...(context.newRecord
          ? [
              {
                message: `Or return to ${to}, which was kept:`,
                run: `hub-installer rollback --dir ${layout.root} --to ${to} --no-restore`,
              },
            ]
          : []),
      ],
    },
  );
}

export async function upgrade(
  input: UpgradeInput,
  deps: CommandDeps,
): Promise<CommandOutcome> {
  const { flags } = input;
  const { reporter, pm2 } = deps;
  const root = path.resolve(deps.cwd ?? process.cwd(), flags.dir ?? '.');
  const layout = layoutOf(root);
  const run = deps.run ?? runCommand;
  const releaseLock = await acquireLock(layout.lockFile);
  try {
    // Read under the lock: a run that waited on it must see what the previous one wrote.
    const state = await readState(layout);
    assertNoPending(state);
    const env = await readHubEnv(layout);
    const from = state.current;
    const to = await resolveTarget(state, flags.to, deps);
    if (to === from) {
      return {
        status: 'success-noop',
        result: { directory: root, current: from, upgraded: false },
        summary: [`The Hub is already on ${from}.`],
      };
    }
    if ((compareVersions(to, from) ?? 0) < 0) {
      throw new InstallerError(
        'DOWNGRADE',
        `${to} is older than the running ${from}. An older release does not know the newer migrations and would run on a schema it does not understand.`,
        {
          exitCode: EXIT_INVALID,
          suggestions: [
            {
              message:
                'Go back with rollback, which restores the database backed up before the upgrade:',
              run: `hub-installer rollback --dir ${root} --to ${to}`,
            },
          ],
        },
      );
    }

    const url = healthUrl(env);
    const service: ServiceOptions = {
      layout,
      pm2,
      name: state.name,
      healthUrl: url,
      fetchImpl: deps.fetchImpl,
    };
    checkPlatform();
    await checkPm2(pm2);
    await checkPm2Ownership(service);
    const known = state.releases.find((record) => record.version === to);
    const onDisk = existsSync(releaseDir(layout, to));
    const reuse = known !== undefined && onDisk && fitsMachine(known);
    if (!reuse) {
      await checkPnpm(run);
      await checkTar(run);
      await checkFreeSpace(root);
    }
    const sqlite = state.dialect === 'sqlite';
    if (!sqlite && !flags['backup-done']) {
      throw new InstallerError(
        'BACKUP_REQUIRED',
        `The Hub runs on ${state.dialect}, which hub-installer cannot back up. Back the database up, then pass --backup-done.`,
        { exitCode: EXIT_INVALID },
      );
    }
    const machineMajor = currentNodeMajor();
    const fromRecord = state.releases.find((record) => record.version === from);
    const nodeChanged =
      fromRecord !== undefined &&
      fromRecord.buildTarget.nodeMajor !== machineMajor;

    await confirm(
      [
        `Upgrade the Hub at ${root} from ${from} to ${to}.`,
        'The Hub and every application it hosts stop while the release switches; deployments in progress are marked failed.',
        sqlite
          ? 'The Hub database and configuration are copied to backups/ before anything is migrated.'
          : 'You confirmed with --backup-done that the external database is backed up.',
        ...(nodeChanged
          ? [
              `This machine runs Node ${machineMajor}, but ${from} was built for Node ${fromRecord?.buildTarget.nodeMajor}: ${from} cannot be rolled back to, and hosted applications must be rebuilt with --node-version ${machineMajor}.`,
            ]
          : []),
      ],
      { yes: flags.yes, json: flags.json },
    );

    // Everything up to the stop happens while the current release keeps serving.
    let newRecord: ReleaseRecord | undefined;
    let dir: string;
    if (reuse) {
      reporter.progress(`Reusing the ${to} release already on disk`);
      dir = releaseDir(layout, to);
    } else {
      if (known && onDisk) {
        reporter.progress(
          `The ${to} release on disk was built for another platform or Node major; building it again`,
        );
      }
      // A directory the build would reuse is either a leftover of an interrupted build or one that cannot run here.
      await rm(path.dirname(releaseDir(layout, to)), {
        recursive: true,
        force: true,
      });
      const prepared = await prepareRelease({
        layout,
        version: to,
        registry: state.registry,
        drivers: state.drivers,
        keepSource: flags['keep-source'],
        reporter,
        run,
      });
      dir = prepared.dir;
      newRecord = {
        version: to,
        installedAt: new Date().toISOString(),
        buildTarget: prepared.buildTarget,
      };
    }
    const removeNewRelease = async () => {
      if (newRecord) {
        await rm(path.dirname(releaseDir(layout, to)), {
          recursive: true,
          force: true,
        });
      }
    };

    const cli = { releaseDir: dir, cwd: root, env, run };
    let pending: number;
    try {
      reporter.progress(
        `Checking the configuration and pending migrations with ${to}`,
      );
      await runAppCli(['config', 'check'], cli);
      pending = pendingTaskCount(
        await runAppCli(['db', 'apply', '--dry-run'], cli),
      );
    } catch (error) {
      await removeNewRelease();
      throw error;
    }
    reporter.progress(
      pending > 0
        ? `${to} will apply ${pending} migration and seed task(s)`
        : `${to} has no pending migrations`,
    );

    const name = backupName(from, to, new Date());
    const backupRelative = path.join('backups', name);
    state.pending = {
      action: 'upgrade',
      from,
      to,
      startedAt: new Date().toISOString(),
    };
    await writeState(layout, state);

    // Downtime starts here.
    reporter.progress(`Stopping ${from}`);
    let backup: BackupResult;
    try {
      await stopHub(service);
      // Health stopped answering; make sure nothing else holds the port the new release has to bind.
      await checkPortFree(
        env.APP_SERVER_HOST ?? '127.0.0.1',
        Number(env.APP_SERVER_PORT ?? 13000),
      );
      reporter.progress('Backing up the Hub database and configuration');
      backup = await backupForUpgrade(layout, name, sqlite);
      if (
        sqlite &&
        !backup.databaseFiles.includes(path.basename(HUB_DATABASE))
      ) {
        throw new Error(
          `the SQLite database was not found at ${path.join(layout.storageDir, HUB_DATABASE)}`,
        );
      }
      // Recorded only now that it is complete: a recovery must never restore from a backup that was cut short.
      state.pending.backup = backup.relative;
      await writeState(layout, state);
    } catch (error) {
      // Nothing was switched: bring the current release back and report the upgrade as not done.
      await removeBackup(layout, backupRelative);
      const healthy = await startHub({
        ...service,
        timeoutMs: flags['health-timeout'] * 1000,
      }).catch(() => false);
      delete state.pending;
      await writeState(layout, state);
      await removeNewRelease();
      throw new InstallerError(
        'UPGRADE_ABORTED',
        `Upgrading to ${to} stopped before switching: ${error instanceof Error ? error.message : String(error)}. ${healthy ? `${from} is running again.` : `${from} did not start again; start it with pm2 start ${layout.ecosystemFile}.`}`,
        {
          exitCode: healthy ? EXIT_FAILED : EXIT_ROLLBACK_FAILED,
          cause: error,
        },
      );
    }

    try {
      // Marked before the link moves, so an interruption from here on is undone with a database restore.
      state.pending.switched = true;
      await writeState(layout, state);
      await switchCurrent(layout, releaseLinkTarget(to));
      reporter.progress('Applying database migrations');
      await runAppCli(['db', 'apply'], cli);
      reporter.progress(`Starting ${to}`);
      const healthy = await startHub({
        ...service,
        timeoutMs: flags['health-timeout'] * 1000,
      });
      if (!healthy) {
        throw new Error(
          `${url} did not become healthy (waited up to ${flags['health-timeout']}s)`,
        );
      }
    } catch (error) {
      reporter.progress(`Rolling back to ${from}`);
      return rollBackUpgrade({
        layout,
        state,
        service,
        from,
        to,
        pending,
        backup,
        newRecord,
        timeoutMs: flags['health-timeout'] * 1000,
        cause: error,
      });
    }

    // The new release is serving: record that first, so nothing after this can make it look unfinished.
    const at = new Date().toISOString();
    state.current = to;
    if (newRecord) replaceRecord(state, newRecord);
    delete state.pending;
    state.history.push({
      action: 'upgrade',
      from,
      to,
      at,
      outcome: 'completed',
      migrations: pending,
      backup: backup.relative,
    });
    await writeState(layout, state);

    const pruned = releasesToPrune(state.releases, [to, from], flags.keep);
    for (const record of pruned) {
      await rm(path.dirname(releaseDir(layout, record.version)), {
        recursive: true,
        force: true,
      });
    }
    if (pruned.length > 0) {
      state.releases = state.releases.filter(
        (record) => !pruned.some((gone) => gone.version === record.version),
      );
      await writeState(layout, state);
    }

    const notes = [
      'Deployments that were in progress are marked failed; start them again in the Hub.',
      ...(nodeChanged
        ? [
            `Rebuild hosted applications with --node-version ${machineMajor} before deploying them again.`,
          ]
        : []),
    ];
    return {
      status: 'success',
      result: {
        directory: root,
        from,
        to,
        upgraded: true,
        reused: reuse,
        migrations: pending,
        backup: backup.relative,
        pruned: pruned.map((record) => record.version),
        notes,
      },
      summary: [
        `Upgraded the Hub from ${from} to ${to}.`,
        `  Migrations  ${pending}`,
        `  Backup      ${backup.relative}`,
        ...(pruned.length > 0
          ? [
              `  Pruned      ${pruned.map((record) => record.version).join(', ')}`,
            ]
          : []),
        ...notes.map((note) => `  ${note}`),
      ],
    };
  } finally {
    await releaseLock();
  }
}
