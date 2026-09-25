import type { Application } from '@nocobase/app-server';
import {
  databaseManagerToken,
  type ChecksumMismatch,
  type DatabaseManager,
  type MigrationHistoryRecord,
} from '@nocobase/db';
import type { AppCommandContext, AppCommandRuntime } from './context.ts';
import {
  AppDatabaseTaskError,
  type AppDatabaseConfig,
  refreshAppCollectionsArtifact,
  runAppDatabaseTasks,
  type AppCollectionsRefreshResult,
  type AppDatabaseTaskKind,
  type AppDatabaseTaskResult,
  type AppDatabaseTasksResult,
} from '@nocobase/app-server/database';

import type { AppDatabaseTask } from '@nocobase/app-server/database';
import { createInterface } from 'node:readline/promises';

import { applicationState } from './runtime/command-store.ts';

interface CommandOutput {
  log(message: string): void;
  logJson(value: unknown): void;
  exit(code: number): never;
  /** Where a refresh failure is reported; `log` when absent. */
  warn?(message: string): void;
}

interface DatabaseSelectionFlags {
  json: boolean;
  all: boolean;
  connection?: string;
  /**
   * Regenerate `database/<connection>/collections/` for every connection whose
   * migrations this run changed. Off unless a caller asks, so a programmatic
   * caller never writes files it did not expect; the commands pass their
   * `--collections` flag, which defaults to on.
   */
  collections?: boolean;
}

/** How one connection's Collection cache refresh went, after the migrations that made it stale. */
export type DatabaseCollectionsRefresh = AppCollectionsRefreshResult;

/** A database command's result, plus the cache refreshes it ran; `collections` is absent when none ran. */
export type DatabaseCommandResult = AppDatabaseTasksResult & {
  collections?: DatabaseCollectionsRefresh[];
};

/**
 * Whether this run may write the Collection cache. A built `dist/` is a
 * deployment: the cache is for whoever develops the application, and nothing
 * there reads it, so a deployment's `db apply` leaves no files behind.
 */
export function collectionsRefreshAllowed(): boolean {
  try {
    return applicationState().location.kind !== 'deployment';
  } catch {
    // Not run through the CLI runner, as in a test that binds a command
    // directly: nothing says this is a deployment.
    return true;
  }
}

/**
 * Runs migrations and seeds as one plan, which is the same shape startup
 * executes. One plan is what makes `fresh` correct: a connection's schema is
 * rebuilt by its migrations task, and its seeds run after, against the
 * rebuilt schema.
 */
export async function runDatabaseApplyCommand(
  command: CommandOutput,
  flags: DatabaseSelectionFlags & { fresh?: boolean; force?: boolean },
  context: Pick<AppCommandContext, 'loadRuntime' | 'createApp'>,
): Promise<void> {
  if (
    flags.fresh &&
    !flags.force &&
    (Boolean(process.env.CI) || !process.stdin.isTTY || !process.stdout.isTTY)
  ) {
    command.log('Reset requires --force in CI or a non-interactive terminal.');
    command.exit(1);
    return;
  }
  const result = await executeWithApplication(command, flags, context, (app) =>
    runAppDatabaseTasks(app.config.get<AppDatabaseConfig>('database')!, {
      ...planOptions(app, flags),
      kind: ['migrations', 'seeds'],
      ...(flags.fresh
        ? {
            fresh: true,
            confirmFresh: flags.force
              ? undefined
              : (plan: readonly AppDatabaseTask[]) =>
                  confirmFresh(command, plan),
          }
        : {}),
    }),
  );
  if (!result) return;

  if (flags.json) command.logJson(result);
  else {
    if (!result.results.length) command.log('No database is configured.');
    for (const entry of result.results) {
      command.log(
        `[${entry.connection}] ${entry.kind}: ${entry.status}${entry.reason ? ` (${entry.reason})` : ''}${entry.error ? `: ${entry.error}` : ''}`,
      );
      if (entry.batch !== undefined) command.log(`Batch: ${entry.batch}`);
      if (entry.executed)
        command.log(`Executed: ${entry.executed.join(', ') || 'none'}`);
      if (entry.skipped)
        command.log(`Skipped: ${entry.skipped.join(', ') || 'none'}`);
      if (entry.fresh) command.log('Fresh: true');
      for (const warning of entry.warnings ?? [])
        command.log(
          `WARNING: checksum changed since it was executed: ${describe(warning)}`,
        );
      if (entry.warnings?.length) {
        // Which command depends on what the edit did, and repair is only ever
        // right for the first case: it records that the source and the schema
        // agree. Used on a change the database never received, it makes an
        // un-applied migration look applied.
        command.log(
          'If the edit left the schema identical — a reformat, a comment, a rebuild — run "nocobase db repair" to realign the history.',
        );
        command.log(
          'If it changed what the migration does, run "nocobase db redo" while its branch is unmerged, or add a new migration once it is merged.',
        );
      }
    }
  }
  reportCollectionsRefresh(command, result, flags.json);
  if (!result.ok) command.exit(1);
}

/**
 * Rolls back the latest migration batch. The batch is the unit the history
 * records, so a batch that mixed application and plugin migrations rolls back
 * as one: the confirmation names every migration and the package it belongs
 * to rather than silently rolling back someone else's.
 */
export async function runDatabaseRollbackCommand(
  command: CommandOutput,
  flags: DatabaseSelectionFlags & { force?: boolean },
  context: Pick<AppCommandContext, 'loadRuntime' | 'createApp'>,
): Promise<void> {
  const result = await executeWithApplication(
    command,
    flags,
    context,
    async (app) => {
      const rollback = (dryRun: boolean): Promise<AppDatabaseTasksResult> =>
        runRollbackTasks(app, flags, dryRun);

      // Preview first, so every `down` about to run is on screen before one
      // does. Nothing is undone by the preview itself.
      const preview = await rollback(true);
      if (!rolledBackRecords(preview).length) return preview;
      if (
        !flags.force &&
        !(await confirmRollback(command, preview, 'rollback'))
      ) {
        throw new Error('Rollback cancelled.');
      }
      return rollback(false);
    },
  );
  if (!result) return;

  if (flags.json) command.logJson(result);
  else reportDatabaseEntries(command, result);
  reportCollectionsRefresh(command, result, flags.json);
  if (!result.ok) command.exit(1);
}

/**
 * Rolls the latest migration batch back and applies it again, which is what
 * correcting a migration before its branch is merged needs. Editing an
 * executed migration otherwise changes nothing: it is already recorded, so a
 * plain apply skips it.
 */
export async function runDatabaseRedoCommand(
  command: CommandOutput,
  flags: DatabaseSelectionFlags & { force?: boolean },
  context: Pick<AppCommandContext, 'loadRuntime' | 'createApp'>,
): Promise<void> {
  const result = await executeWithApplication(
    command,
    flags,
    context,
    async (app) => {
      const preview = await runRollbackTasks(app, flags, true);
      if (!rolledBackRecords(preview).length) return preview;
      if (!flags.force && !(await confirmRollback(command, preview, 'redo'))) {
        throw new Error('Redo cancelled.');
      }

      const rolledBack = await runRollbackTasks(app, flags, false);
      if (!rolledBack.ok) return rolledBack;
      const applied = await runAppDatabaseTasks(
        app.config.get<AppDatabaseConfig>('database')!,
        {
          ...planOptions(app, flags),
          kind: ['migrations', 'seeds'],
        },
      );
      return {
        ok: applied.ok,
        status: applied.ok ? ('completed' as const) : ('failed' as const),
        results: [...rolledBack.results, ...applied.results],
      };
    },
  );
  if (!result) return;

  if (flags.json) command.logJson(result);
  else reportDatabaseEntries(command, result);
  reportCollectionsRefresh(command, result, flags.json);
  if (!result.ok) command.exit(1);
}

/**
 * Releases the migration and seed locks for the selected connections.
 *
 * A run that is killed leaves its lock row behind; it expires on its own once
 * its holder stops sending heartbeats, and a later run takes it over. This is
 * for the case where waiting is not wanted, and for reporting who holds one.
 */
export async function runDatabaseUnlockCommand(
  command: CommandOutput,
  flags: DatabaseSelectionFlags & { force?: boolean },
  context: Pick<AppCommandContext, 'loadRuntime' | 'createApp'>,
): Promise<void> {
  const result = await executeWithApplication(command, flags, context, (app) =>
    runAppDatabaseTasks(app.config.get<AppDatabaseConfig>('database')!, {
      ...planOptions(app, flags),
      kind: ['migrations', 'seeds'],
      operation: 'unlock',
      force: flags.force,
    }),
  );
  if (!result) return;

  if (flags.json) command.logJson(result);
  else {
    if (!result.results.length) command.log('No database is configured.');
    for (const entry of result.results) {
      command.log(
        `[${entry.connection}] ${entry.kind}: ${entry.status}${entry.reason ? ` (${entry.reason})` : ''}${entry.error ? `: ${entry.error}` : ''}`,
      );
      if (entry.status !== 'completed') continue;
      if (entry.released) {
        command.log(`Released: ${describeLock(entry.lock)}`);
        continue;
      }
      if (entry.lockReason === 'active') {
        command.log(
          `Held: ${describeLock(entry.lock)}. A run is still sending heartbeats; pass --force to release it anyway, which lets a second run start beside it.`,
        );
        continue;
      }
      command.log('Not held.');
    }
  }
  if (!result.ok) command.exit(1);
}

function describeLock(lock: AppDatabaseTaskResult['lock']): string {
  if (!lock) return 'unknown';
  const since = lock.lockedAt ? ` since ${lock.lockedAt.toISOString()}` : '';
  const beat = lock.heartbeatAt
    ? `, last heartbeat ${lock.heartbeatAt.toISOString()}`
    : '';
  return `"${lock.lockedBy}"${since}${beat}`;
}

function runRollbackTasks(
  app: Application,
  flags: DatabaseSelectionFlags,
  dryRun: boolean,
): Promise<AppDatabaseTasksResult> {
  return runAppDatabaseTasks(app.config.get<AppDatabaseConfig>('database')!, {
    ...planOptions(app, flags),
    kind: 'migrations',
    operation: 'rollback',
    dryRun,
  });
}

/**
 * Realigns recorded checksums for both task kinds. Migrations and seeds drift
 * for the same reasons and are answered the same way, so one command covers
 * both rather than making an operator remember which halves drifted.
 */
export async function runDatabaseRepairCommand(
  command: CommandOutput,
  flags: DatabaseSelectionFlags & { dryRun?: boolean; force?: boolean },
  context: Pick<AppCommandContext, 'loadRuntime' | 'createApp'>,
): Promise<void> {
  const kinds: readonly AppDatabaseTaskKind[] = ['migrations', 'seeds'];
  const result = await executeWithApplication(
    command,
    flags,
    context,
    async (app) => {
      const execute = async (
        dryRun: boolean,
      ): Promise<AppDatabaseTasksResult> => {
        const results: AppDatabaseTaskResult[] = [];
        let ok = true;
        for (const kind of kinds) {
          const outcome = await runAppDatabaseTasks(
            app.config.get<AppDatabaseConfig>('database')!,
            {
              ...planOptions(app, flags),
              kind,
              operation: 'repair',
              dryRun,
            },
          );
          results.push(...outcome.results);
          ok &&= outcome.ok;
        }
        return {
          ok,
          status: !results.length
            ? 'not-configured'
            : ok
              ? 'completed'
              : 'failed',
          results,
        };
      };

      // Preview first, so the operator sees every rewrite before one is
      // written. Each write is still conditioned on the checksum read here, so
      // a history that changes in between fails rather than repairing
      // something the preview never showed.
      const preview = await execute(true);
      if (flags.dryRun || !repairedRecords(preview).length) return preview;
      if (!flags.force && !(await confirmRepair(command, preview))) {
        throw new Error('Checksum repair cancelled.');
      }
      return execute(false);
    },
  );
  if (!result) return;

  if (flags.json) command.logJson(result);
  else {
    if (!result.results.length) command.log('No database is configured.');
    for (const entry of result.results) {
      command.log(
        `[${entry.connection}] ${entry.kind}: ${entry.status}${entry.reason ? ` (${entry.reason})` : ''}${entry.error ? `: ${entry.error}` : ''}`,
      );
      if (entry.status !== 'completed') continue;
      const repaired = entry.repaired ?? [];
      command.log(
        `${entry.dryRun ? 'Would repair' : 'Repaired'}: ${repaired.length || 'none'}`,
      );
      for (const record of repaired) command.log(`  ${describe(record)}`);
    }
  }
  if (!result.ok) command.exit(1);
}

function planOptions(
  app: Application,
  flags: DatabaseSelectionFlags,
): {
  paths: Application['paths'];
  runtimeConfig: Application['config'];
  container: Application['container'];
  contributions: Application['databaseTaskContributions'];
  database: () => DatabaseManager;
  all: boolean;
  connection?: string;
} {
  return {
    paths: app.paths,
    runtimeConfig: app.config,
    container: app.container,
    // Plugin migrations and seeds are resolved from the registered plugins,
    // never from config.yml, so they cannot be configured away.
    contributions: app.databaseTaskContributions,
    database: () => app.container.resolve(databaseManagerToken),
    all: flags.all,
    connection: flags.connection,
  };
}

/**
 * Assembles the application, runs one database operation against it, and
 * disposes it. Returns undefined when the command has already reported a
 * failure and exited.
 */
async function executeWithApplication(
  command: CommandOutput,
  flags: DatabaseSelectionFlags,
  context: Pick<AppCommandContext, 'loadRuntime' | 'createApp'>,
  run: (app: Application) => Promise<AppDatabaseTasksResult>,
): Promise<DatabaseCommandResult | undefined> {
  let result: AppDatabaseTasksResult | undefined;
  let collections: DatabaseCollectionsRefresh[] | undefined;
  let runtime: AppCommandRuntime | undefined;
  let app: Application | undefined;
  try {
    runtime = await context.loadRuntime();
    let failure: unknown;
    let failed = false;
    try {
      app = await context.createApp(runtime);
      app.registerProviders();
      result = await run(app);
      // Before shutdown, on the manager the migrations just used: the cache
      // is read from the database state this run left behind.
      if (flags.collections) {
        collections = await refreshAppCollectionsArtifact(
          app.config.get<AppDatabaseConfig>('database')!,
          result,
          {
            paths: app.paths,
            database: app.container.resolve(databaseManagerToken),
          },
        );
      }
    } catch (error) {
      failed = true;
      failure = error;
    }
    // A factory may bind runtime.app before throwing. Dispose partial assembly too.
    const cleanupErrors: unknown[] = [];
    try {
      await (app ?? runtime.app)?.shutdown();
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await runtime.scope.destroy();
    } catch (error) {
      cleanupErrors.push(error);
    }
    delete runtime.app;
    if (failed && cleanupErrors.length) {
      throw new AggregateError(
        [failure, ...cleanupErrors],
        `${failure instanceof Error ? failure.message : String(failure)}; application cleanup also failed`,
        { cause: failure },
      );
    }
    if (failed) throw failure;
    if (cleanupErrors.length)
      throw new AggregateError(cleanupErrors, 'Application cleanup failed');
  } catch (error) {
    if (!(error instanceof AppDatabaseTaskError)) {
      if (flags.json)
        command.logJson({
          ok: false,
          status: 'failed',
          connection: flags.connection,
          error: error instanceof Error ? error.message : String(error),
        });
      else command.log(error instanceof Error ? error.message : String(error));
      command.exit(1);
      return undefined;
    }
    result = error.result;
  }
  if (!result) throw new Error('Database task returned no result.');
  return collections ? { ...result, collections } : result;
}

function reportCollectionsRefresh(
  command: CommandOutput,
  result: DatabaseCommandResult,
  json: boolean,
): void {
  for (const entry of result.collections ?? []) {
    if (entry.status === 'failed') {
      const message = `Could not refresh the Collection cache of "${entry.connection}": ${entry.error}. The migrations are applied; run "nocobase collections generate --connection ${entry.connection}" to rebuild it.`;
      if (command.warn) command.warn(message);
      else if (!json) command.log(`WARNING: ${message}`);
      continue;
    }
    if (json) continue;
    const written = entry.written?.length ?? 0;
    const deleted = entry.deleted?.length ?? 0;
    command.log(
      `[${entry.connection}] collections: ${written || deleted ? `refreshed (${written} written, ${deleted} deleted)` : 'up to date'}`,
    );
  }
}

/** Every drifted record across the plan, flattened for counting and display. */
function repairedRecords(result: AppDatabaseTasksResult): {
  connection: string;
  kind: AppDatabaseTaskKind;
  record: ChecksumMismatch;
}[] {
  return result.results.flatMap((entry: AppDatabaseTaskResult) =>
    (entry.repaired ?? []).map((record) => ({
      connection: entry.connection,
      kind: entry.kind,
      record,
    })),
  );
}

function describe(record: ChecksumMismatch): string {
  return `${record.name} (${record.packageName}): ${record.recordedChecksum.slice(0, 12)} -> ${record.sourceChecksum.slice(0, 12)}`;
}

/** Every history record the rollback covers, flattened for display. */
function rolledBackRecords(result: AppDatabaseTasksResult): {
  connection: string;
  record: MigrationHistoryRecord;
}[] {
  return result.results.flatMap((entry: AppDatabaseTaskResult) =>
    (entry.records ?? []).map((record) => ({
      connection: entry.connection,
      record,
    })),
  );
}

/** Prints whichever of a task result's fields the operation produced. */
function reportDatabaseEntries(
  command: CommandOutput,
  result: AppDatabaseTasksResult,
): void {
  if (!result.results.length) {
    command.log('No database is configured.');
    return;
  }

  for (const entry of result.results) {
    command.log(
      `[${entry.connection}] ${entry.kind}: ${entry.status}${entry.reason ? ` (${entry.reason})` : ''}${entry.error ? `: ${entry.error}` : ''}`,
    );
    if (entry.status !== 'completed') continue;
    if (entry.dryRun) {
      command.log('Nothing to roll back.');
      continue;
    }
    if (entry.batch !== undefined) command.log(`Batch: ${entry.batch}`);
    if (entry.rolledBack)
      command.log(`Rolled back: ${entry.rolledBack.join(', ') || 'none'}`);
    if (entry.executed)
      command.log(`Executed: ${entry.executed.join(', ') || 'none'}`);
    if (entry.skipped)
      command.log(`Skipped: ${entry.skipped.join(', ') || 'none'}`);
    for (const warning of entry.warnings ?? [])
      command.log(
        `WARNING: checksum changed since it was executed: ${describe(warning)}`,
      );
  }
}

async function confirmRollback(
  command: { log(message: string): void },
  preview: AppDatabaseTasksResult,
  operation: 'rollback' | 'redo',
): Promise<boolean> {
  if (process.env.CI || !process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      `A ${operation} requires --force in CI or a non-interactive terminal.`,
    );
  }
  const batches = [
    ...new Set(
      preview.results
        .filter((entry) => entry.batch !== undefined)
        .map((entry) => `${entry.connection}: batch ${String(entry.batch)}`),
    ),
  ];
  command.log(
    `WARNING: this runs down() for every migration in ${batches.join(', ')}:`,
  );
  // The package is on every line: a batch can hold plugin migrations executed
  // in the same run, and they roll back with it.
  for (const { connection, record } of rolledBackRecords(preview))
    command.log(`  [${connection}] ${record.packageName}: ${record.name}`);
  command.log(
    'Data in anything these migrations drop is lost. Seeds are not re-run, so rows a seed inserted into a table this batch recreates are not restored.',
  );
  if (operation === 'redo')
    command.log('Every migration then applies again from its current source.');
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = (await prompt.question('Type "yes" to continue: '))
      .trim()
      .toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    prompt.close();
  }
}

async function confirmRepair(
  command: { log(message: string): void },
  result: AppDatabaseTasksResult,
): Promise<boolean> {
  if (process.env.CI || !process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      'Checksum repair requires --force in CI or a non-interactive terminal.',
    );
  }
  command.log(
    'The following history records will be rewritten to match the current sources:',
  );
  for (const { connection, kind, record } of repairedRecords(result))
    command.log(`  [${connection}] ${kind}: ${describe(record)}`);
  command.log(
    'This rewrites recorded history only. It runs nothing, re-runs nothing, and undoes nothing.',
  );
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = (await prompt.question('Type "yes" to continue: '))
      .trim()
      .toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    prompt.close();
  }
}

async function confirmFresh(
  command: { log(message: string): void },
  plan: readonly AppDatabaseTask[],
): Promise<boolean> {
  if (process.env.CI || !process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      'Reset requires --force in CI or a non-interactive terminal.',
    );
  }
  // One line per connection: a plan covering both kinds lists each twice.
  const targets = [
    ...new Set(
      plan.filter((task) => !task.skipReason).map((task) => task.connection),
    ),
  ];
  const skipped = [
    ...new Set(
      plan
        .filter((task) => task.skipReason)
        .map((task) => `${task.connection} (${task.skipReason})`),
    ),
  ];
  command.log(
    `WARNING: this will delete all managed schema objects for: ${targets.join(', ') || 'none'}.`,
  );
  command.log('Every migration and seed then runs again from an empty schema.');
  if (skipped.length) command.log(`Skipped: ${skipped.join(', ')}.`);
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = (await prompt.question('Type "yes" to continue: '))
      .trim()
      .toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    prompt.close();
  }
}
