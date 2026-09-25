import type { Application } from '@nocobase/app-server';
import {
  databaseManagerToken,
  type ChecksumMismatch,
  type DatabaseManager,
  type MigrationHistoryRecord,
} from '@nocobase/db';
import type { AppCommandContext } from './context.ts';
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

import { CommandError, isCommandError } from './command/errors.ts';
import { withAppInstance } from './command/lifecycle.ts';
import { applicationState } from './runtime/command-store.ts';

/** What the database commands print through: the `AppCommand` running them. */
interface DatabaseCommandOutput {
  /** Text for people; silent under `--json`. */
  log(message: string): void;
  /** Collected into the document's `warnings` under `--json`. */
  warn(message: string): unknown;
  /** Whether stdout carries the `--json` document, which moves a confirmation prompt to stderr. */
  jsonEnabled(): boolean;
}

interface DatabaseSelectionFlags {
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

/**
 * What a database command returns, which is `result` under `--json`. A run that fails throws a `CommandError` instead,
 * and its `details` carry the same `results`.
 */
export interface DatabaseCommandResult {
  /** `not-configured` when no database is configured, so nothing ran; absent otherwise. */
  readonly state?: 'not-configured';
  /** One entry per connection and task kind, in the order the plan ran them. */
  readonly results: readonly AppDatabaseTaskResult[];
  /** The Collection cache refreshes the run made; absent when none ran. */
  readonly collections?: readonly DatabaseCollectionsRefresh[];
}

/** A run as the operation left it: failed or not, every entry is printed before the command settles. */
type DatabaseRun = AppDatabaseTasksResult & {
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
  command: DatabaseCommandOutput,
  flags: DatabaseSelectionFlags & { fresh?: boolean; force?: boolean },
  context: Pick<AppCommandContext, 'loadRuntime' | 'createApp'>,
): Promise<DatabaseCommandResult> {
  if (flags.fresh && !flags.force && !canPrompt()) {
    throw forceRequired(
      'Reset requires --force in CI or a non-interactive terminal.',
    );
  }
  const result = await executeWithApplication(flags, context, (app) =>
    runAppDatabaseTasks(app.config.get<AppDatabaseConfig>('database')!, {
      ...planOptions(app, flags),
      kind: ['migrations', 'seeds'],
      ...(flags.fresh
        ? {
            fresh: true,
            confirmFresh: flags.force
              ? undefined
              : async (plan: readonly AppDatabaseTask[]) => {
                  if (!(await confirmFresh(command, plan))) {
                    throw cancelled('Fresh migration cancelled.');
                  }
                  return true;
                },
          }
        : {}),
    }),
  );

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
  reportCollectionsRefresh(command, result);
  return settle(result);
}

/**
 * Rolls back the latest migration batch. The batch is the unit the history
 * records, so a batch that mixed application and plugin migrations rolls back
 * as one: the confirmation names every migration and the package it belongs
 * to rather than silently rolling back someone else's.
 */
export async function runDatabaseRollbackCommand(
  command: DatabaseCommandOutput,
  flags: DatabaseSelectionFlags & { force?: boolean },
  context: Pick<AppCommandContext, 'loadRuntime' | 'createApp'>,
): Promise<DatabaseCommandResult> {
  const result = await executeWithApplication(flags, context, async (app) => {
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
      throw cancelled('Rollback cancelled.');
    }
    return rollback(false);
  });

  reportDatabaseEntries(command, result);
  reportCollectionsRefresh(command, result);
  return settle(result);
}

/**
 * Rolls the latest migration batch back and applies it again, which is what
 * correcting a migration before its branch is merged needs. Editing an
 * executed migration otherwise changes nothing: it is already recorded, so a
 * plain apply skips it.
 */
export async function runDatabaseRedoCommand(
  command: DatabaseCommandOutput,
  flags: DatabaseSelectionFlags & { force?: boolean },
  context: Pick<AppCommandContext, 'loadRuntime' | 'createApp'>,
): Promise<DatabaseCommandResult> {
  const result = await executeWithApplication(flags, context, async (app) => {
    const preview = await runRollbackTasks(app, flags, true);
    if (!rolledBackRecords(preview).length) return preview;
    if (!flags.force && !(await confirmRollback(command, preview, 'redo'))) {
      throw cancelled('Redo cancelled.');
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
  });

  reportDatabaseEntries(command, result);
  reportCollectionsRefresh(command, result);
  return settle(result);
}

/**
 * Releases the migration and seed locks for the selected connections.
 *
 * A run that is killed leaves its lock row behind; it expires on its own once
 * its holder stops sending heartbeats, and a later run takes it over. This is
 * for the case where waiting is not wanted, and for reporting who holds one.
 */
export async function runDatabaseUnlockCommand(
  command: DatabaseCommandOutput,
  flags: DatabaseSelectionFlags & { force?: boolean },
  context: Pick<AppCommandContext, 'loadRuntime' | 'createApp'>,
): Promise<DatabaseCommandResult> {
  const result = await executeWithApplication(flags, context, (app) =>
    runAppDatabaseTasks(app.config.get<AppDatabaseConfig>('database')!, {
      ...planOptions(app, flags),
      kind: ['migrations', 'seeds'],
      operation: 'unlock',
      force: flags.force,
    }),
  );

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
  return settle(result);
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
  command: DatabaseCommandOutput,
  flags: DatabaseSelectionFlags & { dryRun?: boolean; force?: boolean },
  context: Pick<AppCommandContext, 'loadRuntime' | 'createApp'>,
): Promise<DatabaseCommandResult> {
  const kinds: readonly AppDatabaseTaskKind[] = ['migrations', 'seeds'];
  const result = await executeWithApplication(flags, context, async (app) => {
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
      throw cancelled('Checksum repair cancelled.');
    }
    return execute(false);
  });

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
  return settle(result);
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
 * Creates the application, runs one database operation against it, refreshes
 * the Collection cache when asked, and disposes it. A task failure returns
 * its result, so every entry of the plan is printed before the command fails;
 * anything else is thrown as the command's failure.
 */
async function executeWithApplication(
  flags: DatabaseSelectionFlags,
  context: Pick<AppCommandContext, 'loadRuntime' | 'createApp'>,
  run: (app: Application) => Promise<AppDatabaseTasksResult>,
): Promise<DatabaseRun> {
  try {
    return await withAppInstance(context, async (app): Promise<DatabaseRun> => {
      app.registerProviders();
      const result = await run(app);
      if (!flags.collections) return result;
      // Before shutdown, on the manager the migrations just used: the cache
      // is read from the database state this run left behind.
      const collections = await refreshAppCollectionsArtifact(
        app.config.get<AppDatabaseConfig>('database')!,
        result,
        {
          paths: app.paths,
          database: app.container.resolve(databaseManagerToken),
        },
      );
      return collections ? { ...result, collections } : result;
    });
  } catch (error) {
    if (error instanceof AppDatabaseTaskError) return error.result;
    throw toDatabaseCommandError(error, flags.connection);
  }
}

/**
 * The failure of a database or Collections command stopped by something other than one of its tasks: the runtime did
 * not load, the selection named an unknown connection, the application could not be created. A `CommandError` the
 * command threw on purpose — a refusal, a cancellation — keeps its own code.
 */
export function toDatabaseCommandError(
  error: unknown,
  connection: string | undefined,
): Error {
  if (isCommandError(error)) return error;
  // A failure whose cleanup also failed: `describeCommandError` reports the cause's code.
  if (error instanceof AggregateError && isCommandError(error.cause))
    return error;
  return new CommandError(
    error instanceof Error ? error.message : String(error),
    {
      code: 'DATABASE_COMMAND_FAILED',
      ...(connection === undefined ? {} : { details: { connection } }),
      cause: error,
    },
  );
}

/** Connection names the way a message lists them: `"main", "analytics"`. */
export function quoteConnections(names: readonly string[]): string {
  return names.map((name) => `"${name}"`).join(', ');
}

/** A sentence naming the connections that failed, ending with the error when only one did. */
export function connectionFailureMessage(
  prefix: string,
  entries: readonly { readonly connection: string; readonly error?: string }[],
): string {
  const [only] = entries;
  if (entries.length === 1 && only?.error) {
    return `${prefix} "${only.connection}": ${only.error}`;
  }
  return `${prefix} ${quoteConnections(entries.map((entry) => entry.connection))}.`;
}

/** The selection flags to repeat in a suggested command, so it acts on the same connections. */
export function selectionArgs(flags: {
  readonly all: boolean;
  readonly connection?: string;
}): string[] {
  if (flags.all) return ['--all'];
  return flags.connection === undefined
    ? []
    : ['--connection', flags.connection];
}

/** What `run()` returns for a run that succeeded, or the failure it ends in once its entries are printed. */
function settle(result: DatabaseRun): DatabaseCommandResult {
  const collections = result.collections
    ? { collections: result.collections }
    : {};
  if (!result.ok) {
    const failed = result.results.find((entry) => entry.status === 'failed');
    throw new CommandError(
      failed
        ? `Database ${failed.kind} failed for connection "${failed.connection}": ${failed.error ?? 'unknown error'}`
        : 'A database task failed.',
      {
        code: 'DATABASE_TASK_FAILED',
        details: {
          ...(failed
            ? { connection: failed.connection, kind: failed.kind }
            : {}),
          results: result.results,
          ...collections,
        },
      },
    );
  }
  return {
    ...(result.status === 'not-configured'
      ? { state: 'not-configured' as const }
      : {}),
    results: result.results,
    ...collections,
  };
}

function reportCollectionsRefresh(
  command: DatabaseCommandOutput,
  result: DatabaseRun,
): void {
  for (const entry of result.collections ?? []) {
    if (entry.status === 'failed') {
      command.warn(
        `Could not refresh the Collection cache of "${entry.connection}": ${entry.error}. The migrations are applied; run "nocobase collections generate --connection ${entry.connection}" to rebuild it.`,
      );
      continue;
    }
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
  command: DatabaseCommandOutput,
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

/** Whether a person is there to answer a confirmation. */
function canPrompt(): boolean {
  return (
    !process.env.CI &&
    process.stdin.isTTY === true &&
    process.stdout.isTTY === true
  );
}

/** A destructive operation where nobody can confirm it: invalid usage unless --force says so up front. */
function forceRequired(message: string): CommandError {
  return new CommandError(message, { code: 'FORCE_REQUIRED', exit: 2 });
}

/** The person at the terminal declined the confirmation. */
function cancelled(message: string): CommandError {
  return new CommandError(message, { code: 'CANCELLED' });
}

async function confirmRollback(
  command: DatabaseCommandOutput,
  preview: AppDatabaseTasksResult,
  operation: 'rollback' | 'redo',
): Promise<boolean> {
  if (!canPrompt()) {
    throw forceRequired(
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
  const lines = [
    `WARNING: this runs down() for every migration in ${batches.join(', ')}:`,
  ];
  // The package is on every line: a batch can hold plugin migrations executed
  // in the same run, and they roll back with it.
  for (const { connection, record } of rolledBackRecords(preview))
    lines.push(`  [${connection}] ${record.packageName}: ${record.name}`);
  lines.push(
    'Data in anything these migrations drop is lost. Seeds are not re-run, so rows a seed inserted into a table this batch recreates are not restored.',
  );
  if (operation === 'redo')
    lines.push('Every migration then applies again from its current source.');
  return confirm(command, lines);
}

async function confirmRepair(
  command: DatabaseCommandOutput,
  result: AppDatabaseTasksResult,
): Promise<boolean> {
  if (!canPrompt()) {
    throw forceRequired(
      'Checksum repair requires --force in CI or a non-interactive terminal.',
    );
  }
  const lines = [
    'The following history records will be rewritten to match the current sources:',
  ];
  for (const { connection, kind, record } of repairedRecords(result))
    lines.push(`  [${connection}] ${kind}: ${describe(record)}`);
  lines.push(
    'This rewrites recorded history only. It runs nothing, re-runs nothing, and undoes nothing.',
  );
  return confirm(command, lines);
}

async function confirmFresh(
  command: DatabaseCommandOutput,
  plan: readonly AppDatabaseTask[],
): Promise<boolean> {
  if (!canPrompt()) {
    throw forceRequired(
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
  const lines = [
    `WARNING: this will delete all managed schema objects for: ${targets.join(', ') || 'none'}.`,
    'Every migration and seed then runs again from an empty schema.',
  ];
  if (skipped.length) lines.push(`Skipped: ${skipped.join(', ')}.`);
  return confirm(command, lines);
}

/**
 * Shows what is about to happen and asks for "yes". Under `--json` stdout carries the one document and `log` is silent,
 * so the listing and the prompt go to stderr rather than asking about something the person cannot see.
 */
async function confirm(
  command: DatabaseCommandOutput,
  lines: readonly string[],
): Promise<boolean> {
  const json = command.jsonEnabled();
  for (const line of lines) {
    if (json) process.stderr.write(`${line}\n`);
    else command.log(line);
  }
  const prompt = createInterface({
    input: process.stdin,
    output: json ? process.stderr : process.stdout,
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
